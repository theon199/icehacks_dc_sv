/**
 * `food-map`: the caller's neighbourhoods, their healthy-leaning spots and the caller's progress.
 *
 * POST { lat, lng } returns the regions centred in the caller's geohash-5 cell and its eight
 * neighbours (see the contract in docs/FOOD_MAP.md).
 *
 * Regions are filled per cell from Overpass on a miss and kept 90 days; one Overpass query
 * covers every stale cell, behind a lease per cell and a daily allowance per member and in
 * total. Spots are filled per region from Places Nearby Search and kept 30 days, nearest regions
 * first and at most FAMARA_FOOD_MAP_FILLS_PER_REQUEST per request, behind a lease per region and
 * the member's daily and the global monthly allowances. Without GOOGLE_PLACES_API_KEY regions
 * still come back, with `configured: false` and no spots. The caller's own check-ins and claims
 * are read as the caller, so RLS applies.
 *
 * The request position is used only to choose cells and to fill the nearest regions first. It
 * is never stored or logged.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createServiceClient, requireUser } from "../_shared/auth.ts";
import { denoEnv, type EnvReader, readEnv } from "../_shared/env.ts";
import { createHandler, type Handler, HttpError, isHttpError, json } from "../_shared/http.ts";
import { callRpc } from "../_shared/rpc.ts";
import { parseBody } from "../_shared/validate.ts";
import {
  envInt,
  mapWithConcurrency,
  reserveFromBoth,
  supabaseUsageGuards,
  type UsageGuards,
} from "../prices/usage.ts";
import {
  type BBox,
  boundsToBBox,
  cellWithNeighbours,
  distanceToBBox,
  geohashBounds,
  type LatLng,
  type Polygon,
  unionBBox,
} from "./geo.ts";
import { chooseSpots, PHOTO_NAME_PATTERN, searchNearby, type Spot } from "./nearby.ts";
import { DEFAULT_OVERPASS_URL, DEFAULT_USER_AGENT, fetchOsmAreas } from "./overpass.ts";
import { buildRegions, type RegionDraft } from "./regions.ts";
import { polygonSchema } from "./schemas.ts";

export const CELL_PRECISION = 5;
export const REGION_TTL_SECONDS = 90 * 86_400;
export const SPOT_TTL_SECONDS = 30 * 86_400;
const AREA_LEASE_TTL_SECONDS = 90;
const SPOT_LEASE_TTL_SECONDS = 30;
const WAIT_STEPS = 6;
const WAIT_STEP_MS = 500;
const SPOT_FILL_CONCURRENCY = 3;
const TIMES_PER_PLACE_MAX = 20;

export const FoodMapInput = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

// ---------------------------------------------------------------------------------------------
// Shapes read from the database
// ---------------------------------------------------------------------------------------------

const bboxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const isoTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Expected a timestamp.");

const photoSchema = z.object({
  name: z.string().regex(PHOTO_NAME_PATTERN),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  attributions: z.array(z.object({ display_name: z.string(), uri: z.string().nullable() })),
});

const storedSpotSchema = z.object({
  place_id: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  primary_type: z.string().nullable(),
  rank: z.number().int().min(1).max(5),
  photos: z.array(photoSchema).max(3),
});

const storedRegionSchema = z.object({
  id: z.uuid(),
  source: z.enum(["osm", "grid"]),
  source_ref: z.string(),
  name: z.string(),
  geohash5: z.string(),
  polygon: polygonSchema,
  bbox: bboxSchema,
  area_m2: z.number(),
  spots_expires_at: isoTime.nullable(),
  spots: z.array(storedSpotSchema).max(5),
});
export type StoredRegion = z.output<typeof storedRegionSchema>;

export const areaSchema = z.object({
  cells: z.array(z.object({ geohash5: z.string(), expires_at: isoTime })),
  regions: z.array(storedRegionSchema),
});
export type Area = z.output<typeof areaSchema>;

export const mineSchema = z.object({
  check_ins: z.array(z.object({
    place_id: z.string(),
    place_name: z.string().nullable(),
    lat: z.number().nullable(),
    lng: z.number().nullable(),
    region_id: z.uuid().nullable(),
    healthy: z.boolean(),
    visits: z.number().int().min(1),
    times: z.array(isoTime),
  })),
  claims: z.array(z.object({ region_id: z.uuid(), claimed_at: isoTime })),
  totals: z.object({
    check_ins: z.number().int().min(0),
    places: z.number().int().min(0),
    claimed: z.number().int().min(0),
  }),
});
export type Mine = z.output<typeof mineSchema>;

// ---------------------------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------------------------

export interface MineQuery {
  regionIds: string[];
  placeIds: string[];
  box: BBox;
}

export interface FoodMapCaller {
  userId: string;
  mine(query: MineQuery): Promise<Mine>;
}

export interface FoodMapService {
  guards: UsageGuards;
  area(cells: readonly string[]): Promise<Area>;
  storeRegions(cells: readonly string[], regions: RegionDraft[], ttlSeconds: number): Promise<void>;
  storeSpots(regionId: string, spots: Spot[], ttlSeconds: number): Promise<void>;
}

export interface FoodMapDeps {
  env: EnvReader;
  caller(req: Request): Promise<FoodMapCaller>;
  service(): FoodMapService;
  fetch: typeof fetch;
  now(): number;
  newId(): string;
  sleep(ms: number): Promise<void>;
}

// ---------------------------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------------------------

/**
 * `ready`: the spot list is filled (it may be empty). `pending`: not filled yet; a later view
 * fills it. `unavailable`: no Places key, or an allowance held the fill back.
 */
export type SpotsStatus = "ready" | "pending" | "unavailable";

export interface FoodMapResponse {
  configured: boolean;
  notice: "budget" | null;
  attribution: { osm: boolean; google: boolean };
  regions: Array<{
    id: string;
    source: "osm" | "grid";
    name: string;
    polygon: Polygon;
    bbox: BBox;
    progress: { done: number; total: number; claimed: boolean; claimed_at: string | null };
    spots_status: SpotsStatus;
    spots: Array<Omit<Spot, "photos"> & { visits: number; photos: Spot["photos"] }>;
  }>;
  check_ins: Array<{
    place_id: string;
    /** Null once no Google content for the place may be kept (30 days); the visits still count. */
    place_name: string | null;
    lat: number | null;
    lng: number | null;
    region_id: string | null;
    healthy: boolean;
    visits: number;
    times: string[];
  }>;
  totals: { check_ins: number; places: number; claimed: number };
}

interface Settings {
  overpassUrl: string;
  userAgent: string;
  areaFillsUserDaily: number;
  areaFillsDaily: number;
  spotFillsPerRequest: number;
  spotFillsUserDaily: number;
  spotFillsMonthly: number;
}

export function foodMapSettings(env: EnvReader): Settings {
  return {
    overpassUrl: readEnv(["FAMARA_OVERPASS_URL"], env) ?? DEFAULT_OVERPASS_URL,
    userAgent: readEnv(["FAMARA_OVERPASS_USER_AGENT"], env) ?? DEFAULT_USER_AGENT,
    areaFillsUserDaily: envInt(env, "FAMARA_FOOD_MAP_USER_DAILY_AREA_FILLS", 20, {
      min: 0,
      max: 10_000,
    }),
    areaFillsDaily: envInt(env, "FAMARA_FOOD_MAP_DAILY_AREA_FILLS", 500, { min: 0, max: 100_000 }),
    spotFillsPerRequest: envInt(env, "FAMARA_FOOD_MAP_FILLS_PER_REQUEST", 6, { min: 1, max: 20 }),
    spotFillsUserDaily: envInt(env, "FAMARA_FOOD_MAP_USER_DAILY_FILLS", 60, {
      min: 0,
      max: 10_000,
    }),
    spotFillsMonthly: envInt(env, "FAMARA_FOOD_MAP_MONTHLY_FILLS", 2000, {
      min: 0,
      max: 1_000_000,
    }),
  };
}

const iso = (value: string) => new Date(value).toISOString();
const leaseKeyForCell = (cell: string) => `food-map:cell:${cell}`;
const leaseKeyForSpots = (regionId: string) => `food-map:spots:${regionId}`;

function errorCode(error: unknown): string {
  return isHttpError(error) ? error.code : error instanceof Error ? error.name : "unknown";
}

export function createFoodMapHandler(deps: FoodMapDeps): Handler {
  return createHandler(async (req) => {
    const caller = await deps.caller(req);
    const input = await parseBody(req, FoodMapInput, { maxBytes: 1024 });
    const settings = foodMapSettings(deps.env);
    const point: LatLng = { lat: input.lat, lng: input.lng };
    const cells = cellWithNeighbours(point.lat, point.lng, CELL_PRECISION);
    const service = deps.service();

    const filled = await ensureAreas(cells, caller.userId, service, settings);
    let notice = filled.notice;
    const regions = filled.area.regions;

    const apiKey = readEnv(["GOOGLE_PLACES_API_KEY"], deps.env);
    let statuses = new Map<string, SpotsStatus>();
    if (apiKey) {
      const spotFill = await ensureSpots(
        regions,
        point,
        caller.userId,
        apiKey,
        service,
        settings,
      );
      notice = notice ?? spotFill.notice;
      statuses = spotFill.statuses;
    }

    const body = await assemble(regions, cells, caller, apiKey !== undefined, notice, statuses);
    return json(body);
  });

  async function waitForCells(
    service: FoodMapService,
    cells: readonly string[],
    pending: readonly string[],
  ): Promise<Area> {
    let area = await service.area(cells);
    for (let step = 0; step < WAIT_STEPS; step++) {
      const fresh = freshCells(area);
      if (pending.every((cell) => fresh.has(cell))) return area;
      await deps.sleep(WAIT_STEP_MS);
      area = await service.area(cells);
    }
    return area;
  }

  function freshCells(area: Area): Set<string> {
    const now = deps.now();
    return new Set(
      area.cells.filter((c) => Date.parse(c.expires_at) > now).map((c) => c.geohash5),
    );
  }

  /**
   * Makes sure every cell has regions. Stale cells this request leases are filled with one
   * Overpass query; cells another request is filling are waited for briefly. A failed or refused
   * fill keeps whatever is already stored; only when the caller's own cell has never been filled
   * does the request fail (or report the budget).
   */
  async function ensureAreas(
    cells: string[],
    userId: string,
    service: FoodMapService,
    settings: Settings,
  ): Promise<{ area: Area; notice: "budget" | null }> {
    let area = await service.area(cells);
    const fresh = freshCells(area);
    const stale = cells.filter((cell) => !fresh.has(cell));
    if (stale.length === 0) return { area, notice: null };

    const holder = deps.newId();
    const claimed = new Set(
      await service.guards.claimLeases(
        stale.map(leaseKeyForCell),
        holder,
        AREA_LEASE_TTL_SECONDS,
      ),
    );
    const mine = stale.filter((cell) => claimed.has(leaseKeyForCell(cell)));
    const others = stale.filter((cell) => !claimed.has(leaseKeyForCell(cell)));
    let notice: "budget" | null = null;
    let failure: unknown = null;

    try {
      if (mine.length > 0) {
        // A concurrent request may have filled them between our read and the claim.
        const latest = await service.area(cells);
        const latestFresh = freshCells(latest);
        const todo = mine.filter((cell) => !latestFresh.has(cell));
        if (todo.length > 0) {
          const { granted } = await reserveFromBoth(
            service.guards,
            {
              bucket: `food_map_area:user:${userId}`,
              period: "day",
              limit: settings.areaFillsUserDaily,
            },
            { bucket: "food_map_area:global", period: "day", limit: settings.areaFillsDaily },
            1,
          );
          if (granted === 0) {
            notice = "budget";
          } else {
            try {
              const box = unionBBox(todo.map((cell) => boundsToBBox(geohashBounds(cell))))!;
              const areas = await fetchOsmAreas({
                box,
                url: settings.overpassUrl,
                userAgent: settings.userAgent,
                fetch: deps.fetch,
              });
              const knownOsm = latest.regions
                .filter((r) => r.source === "osm")
                .map((r) => ({
                  source_ref: r.source_ref,
                  name: r.name,
                  bbox: r.bbox,
                  geohash5: r.geohash5,
                  polygon: r.polygon,
                }));
              const built = buildRegions(todo, areas, knownOsm);
              await service.storeRegions(todo, [...built.values()].flat(), REGION_TTL_SECONDS);
            } catch (error) {
              failure = error;
              console.error("food-map area fill failed", errorCode(error));
            }
          }
        }
      }
    } finally {
      await service.guards.releaseLeases(mine.map(leaseKeyForCell), holder).catch((error) =>
        console.error("lease release failed", errorCode(error))
      );
    }

    area = others.length > 0 ? await waitForCells(service, cells, others) : await service.area(
      cells,
    );
    const own = cells[0]!;
    const everFilled = new Set(area.cells.map((c) => c.geohash5));
    if (!everFilled.has(own)) {
      if (failure) throw failure;
      if (notice === null) {
        throw new HttpError("upstream_unavailable", "This area is still loading. Try again.", {
          headers: { "Retry-After": "5" },
          details: { reason: "area_fill_in_progress" },
        });
      }
    }
    return { area, notice };
  }

  /**
   * Fills the spot lists of the nearest regions that have none or whose list has expired, and
   * updates `regions` in place. Returns "budget" when an allowance held a fill back, and the
   * spot status of every region that still needs a fill: `unavailable` when an allowance held
   * it back, `pending` otherwise (past this request's cap, filled by another request, or the
   * fill failed). Units are given back only for searches that failed.
   */
  async function ensureSpots(
    regions: StoredRegion[],
    point: LatLng,
    userId: string,
    apiKey: string,
    service: FoodMapService,
    settings: Settings,
  ): Promise<{ notice: "budget" | null; statuses: Map<string, SpotsStatus> }> {
    const now = deps.now();
    const statuses = new Map<string, SpotsStatus>();
    const due = regions
      .filter((r) => r.spots_expires_at === null || Date.parse(r.spots_expires_at) <= now)
      .map((r) => ({ region: r, distance: distanceToBBox(point, r.bbox) }))
      .sort((a, b) => a.distance - b.distance || (a.region.id < b.region.id ? -1 : 1))
      .map((d) => d.region);
    for (const region of due) statuses.set(region.id, "pending");
    const batch = due.slice(0, settings.spotFillsPerRequest);
    if (batch.length === 0) return { notice: null, statuses };

    const holder = deps.newId();
    const claimed = new Set(
      await service.guards.claimLeases(
        batch.map((r) => leaseKeyForSpots(r.id)),
        holder,
        SPOT_LEASE_TTL_SECONDS,
      ),
    );
    const leased = batch.filter((r) => claimed.has(leaseKeyForSpots(r.id)));
    let notice: "budget" | null = null;
    try {
      if (leased.length === 0) return { notice: null, statuses };
      const member = {
        bucket: `food_map_spots:user:${userId}`,
        period: "day" as const,
        limit: settings.spotFillsUserDaily,
      };
      const global = {
        bucket: "food_map_spots:global",
        period: "month" as const,
        limit: settings.spotFillsMonthly,
      };
      const { granted, limitedBy } = await reserveFromBoth(
        service.guards,
        member,
        global,
        leased.length,
      );
      if (limitedBy) notice = "budget";
      const work = leased.slice(0, granted);
      if (limitedBy) {
        // The allowance is spent for now, so a later view would not fill these either.
        for (const region of due) {
          if (!work.includes(region)) statuses.set(region.id, "unavailable");
        }
      }
      // A unit is given back only when the search itself failed. Once it answered, the search
      // is paid for, so a failure to store its result still spends the allowance; otherwise a
      // lasting write failure would repeat paid searches without ever reaching a limit.
      const searched = await mapWithConcurrency(work, SPOT_FILL_CONCURRENCY, async (region) => {
        let places;
        try {
          places = await searchNearby({ box: region.bbox, apiKey, fetch: deps.fetch });
        } catch (error) {
          console.error("food-map spot search failed", errorCode(error));
          return false;
        }
        try {
          const spots = chooseSpots(places, region.polygon);
          await service.storeSpots(region.id, spots, SPOT_TTL_SECONDS);
          region.spots = spots;
          region.spots_expires_at = new Date(deps.now() + SPOT_TTL_SECONDS * 1000).toISOString();
          statuses.set(region.id, "ready");
        } catch (error) {
          console.error("food-map spot store failed", errorCode(error));
        }
        return true;
      });
      const unused = searched.filter((ran) => !ran).length;
      if (unused > 0) {
        await service.guards.release(member.bucket, member.period, unused).catch(() => undefined);
        await service.guards.release(global.bucket, global.period, unused).catch(() => undefined);
      }
      return { notice, statuses };
    } finally {
      await service.guards.releaseLeases(leased.map((r) => leaseKeyForSpots(r.id)), holder)
        .catch((error) => console.error("lease release failed", errorCode(error)));
    }
  }

  async function assemble(
    regions: StoredRegion[],
    cells: readonly string[],
    caller: FoodMapCaller,
    configured: boolean,
    notice: "budget" | null,
    statuses: ReadonlyMap<string, SpotsStatus>,
  ): Promise<FoodMapResponse> {
    const spotsOf = (r: StoredRegion) => (configured ? r.spots : []);
    const box = unionBBox(regions.map((r) => r.bbox)) ??
      unionBBox(cells.map((cell) => boundsToBBox(geohashBounds(cell))))!;
    const mine = await caller.mine({
      regionIds: regions.map((r) => r.id),
      placeIds: [...new Set(regions.flatMap((r) => spotsOf(r).map((s) => s.place_id)))],
      box,
    });
    const visits = new Map(mine.check_ins.map((c) => [c.place_id, c.visits]));
    const claims = new Map(mine.claims.map((c) => [c.region_id, iso(c.claimed_at)]));

    const outRegions = regions.map((r) => {
      const spots = spotsOf(r).map((s) => ({
        place_id: s.place_id,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        primary_type: s.primary_type,
        rank: s.rank,
        visits: visits.get(s.place_id) ?? 0,
        photos: s.photos,
      }));
      const claimedAt = claims.get(r.id) ?? null;
      return {
        id: r.id,
        source: r.source,
        name: r.name,
        polygon: r.polygon,
        bbox: r.bbox,
        progress: {
          done: spots.filter((s) => s.visits > 0).length,
          total: spots.length,
          claimed: claimedAt !== null,
          claimed_at: claimedAt,
        },
        spots_status: configured ? statuses.get(r.id) ?? "ready" : "unavailable",
        spots,
      };
    });
    const checkIns = mine.check_ins.map((c) => ({
      place_id: c.place_id,
      place_name: c.place_name,
      lat: c.lat,
      lng: c.lng,
      region_id: c.region_id,
      healthy: c.healthy,
      visits: c.visits,
      times: c.times
        .map(iso)
        .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
        .slice(0, TIMES_PER_PLACE_MAX),
    }));
    return {
      configured,
      notice,
      attribution: {
        // Grid regions named after an OSM region ("Near …") show OSM data too.
        osm: regions.some((r) => r.source === "osm" || r.name.startsWith("Near ")),
        google: outRegions.some((r) => r.spots.length > 0) || checkIns.length > 0,
      },
      regions: outRegions,
      check_ins: checkIns,
      totals: mine.totals,
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Production wiring
// ---------------------------------------------------------------------------------------------

export function supabaseFoodMapCaller(userId: string, client: SupabaseClient): FoodMapCaller {
  return {
    userId,
    async mine({ regionIds, placeIds, box }) {
      return await callRpc(client, "food_map_mine", {
        p_region_ids: regionIds,
        p_place_ids: placeIds,
        p_min_lng: box[0],
        p_min_lat: box[1],
        p_max_lng: box[2],
        p_max_lat: box[3],
      }, mineSchema);
    },
  };
}

export function supabaseFoodMapService(service: SupabaseClient): FoodMapService {
  return {
    guards: supabaseUsageGuards(service),
    async area(cells) {
      return await callRpc(service, "food_map_area", { p_cells: cells }, areaSchema);
    },
    async storeRegions(cells, regions, ttlSeconds) {
      await callRpc(service, "store_food_regions", {
        p_cells: cells,
        p_regions: regions,
        p_ttl_seconds: ttlSeconds,
      }, z.unknown());
    },
    async storeSpots(regionId, spots, ttlSeconds) {
      await callRpc(service, "store_food_region_spots", {
        p_region_id: regionId,
        p_spots: spots,
        p_ttl_seconds: ttlSeconds,
      }, z.number().int());
    },
  };
}

export function defaultFoodMapDeps(env: EnvReader = denoEnv): FoodMapDeps {
  return {
    env,
    async caller(req) {
      const ctx = await requireUser(req, { env });
      return supabaseFoodMapCaller(ctx.user.id, ctx.client);
    },
    service: () => supabaseFoodMapService(createServiceClient({ env })),
    fetch: (input, init) => fetch(input, init),
    now: Date.now,
    newId: () => crypto.randomUUID(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}
