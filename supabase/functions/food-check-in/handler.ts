/**
 * `food-check-in`: records that the caller is eating at a place.
 *
 * POST { place_id, lat, lng, accuracy_m }. `lat`/`lng` are the device position. They are used
 * only for the distance check and are never stored or logged.
 *
 *   1. The place's own position comes from the food map's spots, then from fresh places-search
 *      results, then from one Place Details call (behind the member's daily and the global
 *      monthly allowances; the answer is cached for 30 days in `places_cache`). The check-in
 *      keeps the name and position only until that source copy expires.
 *   2. The device must be within 200 m + min(accuracy, 100 m) of the place (422 `too_far`).
 *   3. The region is the smallest live region containing the place, preferring one that lists
 *      the place as a spot.
 *   4. `record_food_check_in` applies the 4-hour cooldown per place and 12 check-ins per 24
 *      hours (429 `rate_limited`), stores the check-in and claims every region it completes:
 *      its own region and any other live region that lists the place as a spot.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createServiceClient, requireUser } from "../_shared/auth.ts";
import { denoEnv, type EnvReader, readEnv } from "../_shared/env.ts";
import { createHandler, type Handler, HttpError, json } from "../_shared/http.ts";
import { callRpc } from "../_shared/rpc.ts";
import { parseBody } from "../_shared/validate.ts";
import { envInt, reserveFromBoth, supabaseUsageGuards, type UsageGuards } from "../prices/usage.ts";
import {
  cellWithNeighbours,
  distanceMeters,
  type LatLng,
  pointInPolygon,
} from "../food-map/geo.ts";
import { polygonSchema } from "../food-map/schemas.ts";
import { isHealthyLeaning } from "../food-map/healthy.ts";
import { placeDetails } from "./details.ts";

export const CHECK_IN_RADIUS_M = 200;
export const CHECK_IN_MAX_ACCURACY_BONUS_M = 100;
const PLACE_CACHE_TTL_MS = 30 * 86_400_000;

export const CheckInInput = z.object({
  place_id: z.string().regex(/^[A-Za-z0-9_-]{1,300}$/, "Use a Google place id."),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy_m: z.number().min(0).max(1000),
});

/** Allowed distance for a reported GPS accuracy. */
export function allowedDistance(accuracyM: number): number {
  return CHECK_IN_RADIUS_M + Math.min(Math.max(accuracyM, 0), CHECK_IN_MAX_ACCURACY_BONUS_M);
}

const isoTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Expected a timestamp.");

export const knownPlaceSchema = z.object({
  source: z.enum(["spot", "places_cache"]),
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  primary_type: z.string().nullable(),
  types: z.array(z.string()),
  spot_region_ids: z.array(z.uuid()),
  /** When the copy this content came from must be dropped (30 days after Google returned it). */
  cached_until: isoTime,
});
export type KnownPlace = z.output<typeof knownPlaceSchema>;

export const regionCandidatesSchema = z.array(z.object({
  id: z.uuid(),
  name: z.string(),
  polygon: polygonSchema,
  area_m2: z.number(),
}));
export type RegionCandidate = z.output<typeof regionCandidatesSchema>[number];

export const checkInResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("rate_limited"),
    reason: z.enum(["cooldown", "daily"]),
    retry_at: isoTime,
  }),
  z.object({
    status: z.literal("ok"),
    visits_here: z.number().int().min(1),
    total_check_ins: z.number().int().min(1),
    healthy: z.boolean(),
    region: z.object({
      id: z.uuid(),
      name: z.string(),
      done: z.number().int().min(0),
      total: z.number().int().min(0),
      claimed: z.boolean(),
    }).nullable(),
    claimed_now: z.boolean(),
    claimed_regions: z.array(z.object({ id: z.uuid(), name: z.string() })),
  }),
]);
export type CheckInResult = z.output<typeof checkInResultSchema>;

export interface CheckInRecord {
  userId: string;
  placeId: string;
  placeName: string;
  placeLat: number;
  placeLng: number;
  /** The source copy's own expiry, so the check-in never keeps the content longer. */
  placeCachedUntil: string;
  regionId: string | null;
  healthy: boolean;
}

export interface CachedPlaceRow {
  cache_key: string;
  query: string;
  lat_rounded: number;
  lng_rounded: number;
  payload: {
    places: Array<
      {
        id: string;
        name: string;
        lat: number;
        lng: number;
        primary_type: string | null;
        types: string[];
      }
    >;
  };
  fetched_at: string;
  expires_at: string;
}

export interface CheckInService {
  guards: UsageGuards;
  resolvePlace(placeId: string): Promise<KnownPlace | null>;
  cachePlace(row: CachedPlaceRow): Promise<void>;
  regionsContaining(cells: readonly string[], point: LatLng): Promise<RegionCandidate[]>;
  record(record: CheckInRecord): Promise<CheckInResult>;
}

export interface FoodCheckInDeps {
  env: EnvReader;
  caller(req: Request): Promise<{ userId: string }>;
  service(): CheckInService;
  fetch: typeof fetch;
  now(): number;
}

export interface CheckInResponse {
  visits_here: number;
  total_check_ins: number;
  healthy: boolean;
  region: { id: string; name: string; done: number; total: number; claimed: boolean } | null;
  claimed_now: boolean;
  /**
   * Every region this check-in completed, which can include a larger region around `region`
   * that lists the same place.
   */
  claimed_regions: Array<{ id: string; name: string }>;
}

/** The smallest containing region, preferring one that lists the place as a spot. */
export function pickRegion(
  candidates: readonly RegionCandidate[],
  point: LatLng,
  spotRegionIds: readonly string[],
): RegionCandidate | null {
  const containing = candidates
    .filter((c) => pointInPolygon(point, c.polygon))
    .sort((a, b) => a.area_m2 - b.area_m2 || (a.id < b.id ? -1 : 1));
  return containing.find((c) => spotRegionIds.includes(c.id)) ?? containing[0] ?? null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function createFoodCheckInHandler(deps: FoodCheckInDeps): Handler {
  return createHandler(async (req) => {
    const caller = await deps.caller(req);
    const input = await parseBody(req, CheckInInput, { maxBytes: 2 * 1024 });
    const service = deps.service();

    const place = await locatePlace(input.place_id, caller.userId, service);

    const distance = distanceMeters({ lat: input.lat, lng: input.lng }, place);
    const allowed = allowedDistance(input.accuracy_m);
    if (!(distance <= allowed)) {
      throw new HttpError("too_far", "Check in when you are at the place.", {
        details: { distance_m: Math.ceil(distance), allowed_m: allowed },
      });
    }

    const cells = cellWithNeighbours(place.lat, place.lng, 5);
    const candidates = await service.regionsContaining(cells, place);
    const region = pickRegion(candidates, place, place.spot_region_ids);
    const healthy = place.source === "spot" || isHealthyLeaning(place.primary_type, place.types);

    const result = await service.record({
      userId: caller.userId,
      placeId: input.place_id,
      placeName: place.name,
      placeLat: place.lat,
      placeLng: place.lng,
      placeCachedUntil: place.cached_until,
      regionId: region?.id ?? null,
      healthy,
    });
    if (result.status === "rate_limited") {
      const retryAt = new Date(result.retry_at);
      const seconds = Math.max(1, Math.ceil((retryAt.getTime() - deps.now()) / 1000));
      throw new HttpError(
        "rate_limited",
        result.reason === "cooldown"
          ? "You checked in here recently. Try again later."
          : "You have reached today's check-in limit.",
        {
          details: { retry_at: retryAt.toISOString(), reason: result.reason },
          headers: { "Retry-After": String(seconds) },
        },
      );
    }
    const body: CheckInResponse = {
      visits_here: result.visits_here,
      total_check_ins: result.total_check_ins,
      healthy: result.healthy,
      region: result.region,
      claimed_now: result.claimed_now,
      claimed_regions: result.claimed_regions,
    };
    return json(body);
  });

  async function locatePlace(
    placeId: string,
    userId: string,
    service: CheckInService,
  ): Promise<KnownPlace> {
    const known = await service.resolvePlace(placeId);
    if (known) return known;

    const notFound = new HttpError("not_found", "That place could not be found.");
    const apiKey = readEnv(["GOOGLE_PLACES_API_KEY"], deps.env);
    if (!apiKey) throw notFound;

    const { granted } = await reserveFromBoth(
      service.guards,
      {
        bucket: `food_place_lookup:user:${userId}`,
        period: "day",
        limit: envInt(deps.env, "FAMARA_FOOD_CHECKIN_USER_DAILY_LOOKUPS", 20, {
          min: 0,
          max: 10_000,
        }),
      },
      {
        bucket: "food_place_lookup:global",
        period: "month",
        limit: envInt(deps.env, "FAMARA_FOOD_CHECKIN_MONTHLY_LOOKUPS", 1000, {
          min: 0,
          max: 1_000_000,
        }),
      },
      1,
    );
    if (granted === 0) {
      throw new HttpError("upstream_unavailable", "Place lookups are paused. Try again later.", {
        details: { reason: "budget" },
      });
    }
    const details = await placeDetails(placeId, apiKey, deps.fetch);
    if (!details) throw notFound;

    const now = deps.now();
    const cachedUntil = new Date(now + PLACE_CACHE_TTL_MS).toISOString();
    await service.cachePlace({
      cache_key: `food_place:v1:${placeId}`.slice(0, 200),
      query: "food_place",
      lat_rounded: round2(details.lat),
      lng_rounded: round2(details.lng),
      payload: {
        places: [{
          id: placeId,
          name: details.name,
          lat: details.lat,
          lng: details.lng,
          primary_type: details.primary_type,
          types: details.types,
        }],
      },
      fetched_at: new Date(now).toISOString(),
      expires_at: cachedUntil,
    }).catch((error) =>
      console.error("place cache write failed", error instanceof Error ? error.name : "unknown")
    );
    return {
      source: "places_cache",
      name: details.name,
      lat: details.lat,
      lng: details.lng,
      primary_type: details.primary_type,
      types: details.types,
      spot_region_ids: [],
      cached_until: cachedUntil,
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Production wiring
// ---------------------------------------------------------------------------------------------

export function supabaseCheckInService(service: SupabaseClient): CheckInService {
  return {
    guards: supabaseUsageGuards(service),
    async resolvePlace(placeId) {
      return await callRpc(
        service,
        "resolve_food_place",
        { p_place_id: placeId },
        knownPlaceSchema.nullable(),
      );
    },
    async cachePlace(row) {
      const { error } = await service.from("places_cache").upsert(row, { onConflict: "cache_key" });
      if (error) throw new Error(error.message);
    },
    async regionsContaining(cells, point) {
      return await callRpc(service, "food_regions_containing", {
        p_cells: cells,
        p_lat: point.lat,
        p_lng: point.lng,
      }, regionCandidatesSchema);
    },
    async record(record) {
      return await callRpc(service, "record_food_check_in", {
        p_user_id: record.userId,
        p_place_id: record.placeId,
        p_place_name: record.placeName,
        p_place_lat: record.placeLat,
        p_place_lng: record.placeLng,
        p_place_cached_until: record.placeCachedUntil,
        p_region_id: record.regionId,
        p_healthy: record.healthy,
      }, checkInResultSchema);
    },
  };
}

export function defaultFoodCheckInDeps(env: EnvReader = denoEnv): FoodCheckInDeps {
  return {
    env,
    async caller(req) {
      const ctx = await requireUser(req, { env });
      return { userId: ctx.user.id };
    },
    service: () => supabaseCheckInService(createServiceClient({ env })),
    fetch: (input, init) => fetch(input, init),
    now: Date.now,
  };
}
