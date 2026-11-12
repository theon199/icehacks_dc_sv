/**
 * `places`: restaurants near the caller that may serve a dish.
 *
 * POST { dish, dish_key, lat, lng, radius_m?, limit? } runs a Google Places Text Search for
 * "<dish> restaurant" around the caller, merges the community's "did they have it?" answers
 * (`dish_confirmations`) and returns the places ranked by proximity × confirmation.
 *
 * Searches are cached for 6 hours in `places_cache` per (geohash cell, radius band, query). The
 * search is centred on the cell, never on the caller's exact position, and only the cell centre
 * rounded to 0.01° is stored. Concurrent misses for the same key share one upstream call through
 * a fill lease. Each member is rate limited and upstream calls draw on a global monthly budget.
 * Without `GOOGLE_PLACES_API_KEY` the function answers `{ configured: false, places: [] }`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createServiceClient, requireUser } from "../_shared/auth.ts";
import { denoEnv, type EnvReader, readEnv } from "../_shared/env.ts";
import { createHandler, type Handler, HttpError, json } from "../_shared/http.ts";
import { enforceQuota, type QuotaPolicy } from "../_shared/quota.ts";
import { callRpc } from "../_shared/rpc.ts";
import { parseBody } from "../_shared/validate.ts";
import { envInt, supabaseUsageGuards, type UsageGuards } from "../prices/usage.ts";
import { geohashCenter, geohashEncode, geohashHalfDiagonal } from "./geo.ts";
import { searchText } from "./google.ts";
import { type Confirmation, type Place, type RankedPlace, rankPlaces } from "./rank.ts";

export const CACHE_TTL_MS = 6 * 3_600_000;
/** Geohash precision 6: cells of about 1.2 km × 0.6 km. */
export const CELL_PRECISION = 6;
const LEASE_TTL_SECONDS = 30;
/** Largest circle ever searched: the 8 km band plus a precision-6 cell's half-diagonal. */
const MAX_SEARCH_RADIUS_M = 9000;
const WAIT_STEPS = 6;
const WAIT_STEP_MS = 500;

export const PlacesInput = z.object({
  dish: z.string().trim().min(2).max(80).regex(
    /^[\p{L}\p{N}][\p{L}\p{N} ,.'&()-]*$/u,
    "Use a plain dish name.",
  ),
  dish_key: z.string().regex(/^[a-z0-9][a-z0-9_:-]{0,127}$/, "Use a dish key."),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radius_m: z.number().int().min(500).max(8000).default(5000),
  limit: z.number().int().min(1).max(10).default(10),
});
export type PlacesInput = z.output<typeof PlacesInput>;

const placeSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  rating: z.number().nullable(),
  rating_count: z.number().nullable(),
  price_level: z.number().nullable(),
  open_now: z.boolean().nullable(),
  primary_type: z.string().nullable(),
});
const payloadSchema = z.object({ places: z.array(placeSchema) });

export interface PlacesCacheRow {
  cache_key: string;
  query: string;
  lat_rounded: number;
  lng_rounded: number;
  payload: { places: Place[] };
  fetched_at: string;
  expires_at: string;
}

export interface PlacesCaller {
  enforceQuota(policy: QuotaPolicy): Promise<void>;
  confirmations(dishKey: string, placeIds: readonly string[]): Promise<Map<string, Confirmation>>;
}

export interface PlacesService {
  guards: UsageGuards;
  readCache(key: string, nowIso: string): Promise<{ payload: unknown; fetched_at: string } | null>;
  writeCache(row: PlacesCacheRow): Promise<void>;
}

export interface PlacesDeps {
  env: EnvReader;
  caller(req: Request): Promise<PlacesCaller>;
  service(): PlacesService;
  fetch: typeof fetch;
  now(): number;
  newId(): string;
  sleep(ms: number): Promise<void>;
}

export interface PlacesResponse {
  configured: boolean;
  places: RankedPlace[];
  cached: boolean;
  fetched_at: string | null;
  notice: "budget" | null;
}

/** Lowercase words only, so equivalent queries share a cache entry. */
export function normalizeQuery(dish: string): string {
  const words = dish.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return `${words} restaurant`;
}

/** Radius bands of 1 km, so nearby radii share a search. */
export function radiusBand(radiusM: number): number {
  return Math.min(8000, Math.ceil(radiusM / 1000) * 1000);
}

export function searchKey(input: Pick<PlacesInput, "dish" | "lat" | "lng" | "radius_m">) {
  const cell = geohashEncode(input.lat, input.lng, CELL_PRECISION);
  const band = radiusBand(input.radius_m);
  const query = normalizeQuery(input.dish);
  return { cell, band, query, cacheKey: `v1:${cell}:${band}:${query}`.slice(0, 200) };
}

/**
 * The circle searched for a cell: the radius band plus the distance from the cell centre to its
 * corner, so a caller anywhere in the cell still has their whole band covered. Capped a little
 * above the largest band.
 */
export function searchRadius(cell: string, band: number): number {
  return Math.min(Math.round(band + geohashHalfDiagonal(cell)), MAX_SEARCH_RADIUS_M);
}

export function placesQuota(env: EnvReader): QuotaPolicy {
  return {
    feature: "places",
    limit: envInt(env, "FAMARA_PLACES_USER_DAILY_LIMIT", 60, { min: 1, max: 10_000 }),
    windowSeconds: 86_400,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function createPlacesHandler(deps: PlacesDeps): Handler {
  return createHandler(async (req) => {
    const caller = await deps.caller(req);
    const input = await parseBody(req, PlacesInput, { maxBytes: 4 * 1024 });
    const apiKey = readEnv(["GOOGLE_PLACES_API_KEY"], deps.env);
    if (!apiKey) {
      const body: PlacesResponse = {
        configured: false,
        places: [],
        cached: false,
        fetched_at: null,
        notice: null,
      };
      return json(body);
    }
    await caller.enforceQuota(placesQuota(deps.env));

    const key = searchKey(input);
    const service = deps.service();
    const found = await placesFor(key, apiKey, service);

    const confirmations = found.places.length === 0
      ? new Map<string, Confirmation>()
      : await caller.confirmations(input.dish_key, found.places.map((p) => p.id));
    const body: PlacesResponse = {
      configured: true,
      places: rankPlaces(found.places, confirmations, input, input.radius_m, input.limit),
      cached: found.cached,
      fetched_at: found.fetchedAt,
      notice: found.notice,
    };
    return json(body);
  });

  async function readCached(service: PlacesService, cacheKey: string) {
    const row = await service.readCache(cacheKey, new Date(deps.now()).toISOString());
    if (!row) return null;
    const parsed = payloadSchema.safeParse(row.payload);
    return parsed.success ? { places: parsed.data.places, fetchedAt: row.fetched_at } : null;
  }

  async function placesFor(
    key: ReturnType<typeof searchKey>,
    apiKey: string,
    service: PlacesService,
  ): Promise<
    { places: Place[]; cached: boolean; fetchedAt: string | null; notice: "budget" | null }
  > {
    const hit = await readCached(service, key.cacheKey);
    if (hit) return { ...hit, cached: true, notice: null };

    const leaseKey = `places:${key.cacheKey}`.slice(0, 200);
    const holder = deps.newId();
    const [claimed] = await service.guards.claimLeases([leaseKey], holder, LEASE_TTL_SECONDS);
    if (!claimed) {
      // Another request is running this search; wait for its result instead of paying twice.
      for (let step = 0; step < WAIT_STEPS; step++) {
        await deps.sleep(WAIT_STEP_MS);
        const shared = await readCached(service, key.cacheKey);
        if (shared) return { ...shared, cached: true, notice: null };
      }
      throw new HttpError("upstream_unavailable", "Nearby search is busy. Try again shortly.", {
        headers: { "Retry-After": "2" },
        details: { reason: "search_in_progress" },
      });
    }

    try {
      // A concurrent request may have finished between our cache read and the claim.
      const late = await readCached(service, key.cacheKey);
      if (late) return { ...late, cached: true, notice: null };

      const monthly = envInt(deps.env, "FAMARA_PLACES_MONTHLY_SEARCHES", 900, {
        min: 0,
        max: 1_000_000,
      });
      const granted = await service.guards.reserve("places_search:global", "month", 1, monthly);
      if (granted === 0) return { places: [], cached: false, fetchedAt: null, notice: "budget" };

      const center = geohashCenter(key.cell);
      const places = await searchText({
        query: key.query,
        center,
        radiusM: searchRadius(key.cell, key.band),
        apiKey,
        fetch: deps.fetch,
      });
      const now = deps.now();
      const fetchedAt = new Date(now).toISOString();
      await service.writeCache({
        cache_key: key.cacheKey,
        query: key.query,
        lat_rounded: round2(center.lat),
        lng_rounded: round2(center.lng),
        payload: { places },
        fetched_at: fetchedAt,
        expires_at: new Date(now + CACHE_TTL_MS).toISOString(),
      }).catch((error) => console.error("places cache write failed", error));
      return { places, cached: false, fetchedAt, notice: null };
    } finally {
      await service.guards.releaseLeases([leaseKey], holder).catch((error) =>
        console.error("lease release failed", error)
      );
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Production wiring
// ---------------------------------------------------------------------------------------------

/** How many members answered yes (or no) for a place. */
const answerCount = z.number().int().gte(0);
const summaryRows = z.array(z.object({
  place_id: z.string(),
  yes_count: answerCount,
  no_count: answerCount,
  my_answer: z.boolean().nullable(),
}));

export function supabasePlacesCaller(client: SupabaseClient, now: () => number): PlacesCaller {
  return {
    async enforceQuota(policy) {
      await enforceQuota(client, policy, now);
    },
    async confirmations(dishKey, placeIds) {
      const rows = await callRpc(client, "dish_confirmation_summary", {
        p_dish_key: dishKey,
        p_place_ids: placeIds,
      }, summaryRows);
      return new Map(rows.map((r) => [r.place_id, r]));
    },
  };
}

const cacheRowSchema = z.object({ payload: z.unknown(), fetched_at: z.string() });

export function supabasePlacesService(service: SupabaseClient): PlacesService {
  return {
    guards: supabaseUsageGuards(service),
    async readCache(key, nowIso) {
      const { data, error } = await service
        .from("places_cache")
        .select("payload, fetched_at")
        .eq("cache_key", key)
        .gt("expires_at", nowIso)
        .maybeSingle();
      if (error) {
        console.error("places cache read failed", error);
        return null;
      }
      if (data === null) return null;
      const row = cacheRowSchema.safeParse(data);
      if (!row.success) {
        console.error("places cache row has an unexpected shape");
        return null;
      }
      return row.data;
    },
    async writeCache(row) {
      const { error } = await service.from("places_cache").upsert(row, { onConflict: "cache_key" });
      if (error) throw new Error(error.message);
    },
  };
}

export function defaultPlacesDeps(env: EnvReader = denoEnv): PlacesDeps {
  return {
    env,
    async caller(req) {
      const ctx = await requireUser(req, { env });
      return supabasePlacesCaller(ctx.client, Date.now);
    },
    service: () => supabasePlacesService(createServiceClient({ env })),
    fetch: (input, init) => fetch(input, init),
    now: Date.now,
    newId: () => crypto.randomUUID(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}
