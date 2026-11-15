import { assert, assertEquals } from "@std/assert";
import { envOf, jsonResponse, MemoryUsageGuards, scriptedFetch } from "../prices/testing.ts";
import { distanceMeters } from "../food-map/geo.ts";
import { square } from "../food-map/testing.ts";
import { DETAILS_FIELD_MASK, PLACE_DETAILS_URL } from "./details.ts";
import {
  allowedDistance,
  type CachedPlaceRow,
  type CheckInRecord,
  type CheckInResult,
  createFoodCheckInHandler,
  type FoodCheckInDeps,
  type KnownPlace,
  pickRegion,
  type RegionCandidate,
} from "./handler.ts";

const NOW = Date.parse("2026-11-14T18:00:00Z");
const USER = "aaaaaaaa-0000-4000-8000-000000000001";
const PLACE = { lat: 34.01, lng: -118.49 };
const REGION_ID = "00000000-0000-4000-8000-000000000001";
const SMALL_ID = "00000000-0000-4000-8000-000000000002";
/** About `m` metres north of the place. */
const north = (m: number) => ({ lat: PLACE.lat + m / 111_195, lng: PLACE.lng });

const spot: KnownPlace = {
  source: "spot",
  name: "Bay Bowls",
  ...PLACE,
  primary_type: "salad_shop",
  types: [],
  spot_region_ids: [REGION_ID],
};

const region = (id: string, half: number, name = "Ocean Park"): RegionCandidate => ({
  id,
  name,
  polygon: [square(PLACE.lng, PLACE.lat, half)],
  area_m2: half * 1e8,
});

const ok: CheckInResult = {
  status: "ok",
  visits_here: 1,
  total_check_ins: 35,
  healthy: true,
  region: { id: REGION_ID, name: "Ocean Park", done: 3, total: 3, claimed: true },
  claimed_now: true,
};

function harness(options: {
  env?: Record<string, string>;
  known?: KnownPlace | null;
  regions?: RegionCandidate[];
  result?: CheckInResult;
  api?: Array<(req: Request) => Response | Promise<Response>>;
  guards?: MemoryUsageGuards;
} = {}) {
  const { fetch, requests } = scriptedFetch(options.api ?? []);
  const guards = options.guards ?? new MemoryUsageGuards(() => NOW);
  const records: CheckInRecord[] = [];
  const cached: CachedPlaceRow[] = [];
  const regionQueries: Array<{ cells: readonly string[]; lat: number; lng: number }> = [];
  const deps: FoodCheckInDeps = {
    env: envOf(options.env ?? { GOOGLE_PLACES_API_KEY: "g-key" }),
    caller: () => Promise.resolve({ userId: USER }),
    service: () => ({
      guards,
      resolvePlace: () => Promise.resolve(options.known === undefined ? spot : options.known),
      cachePlace: (row) => {
        cached.push(row);
        return Promise.resolve();
      },
      regionsContaining: (cells, point) => {
        regionQueries.push({ cells, ...point });
        return Promise.resolve(options.regions ?? [region(REGION_ID, 0.005)]);
      },
      record: (record) => {
        records.push(record);
        return Promise.resolve(options.result ?? ok);
      },
    }),
    fetch,
    now: () => NOW,
  };
  return { deps, requests, guards, records, cached, regionQueries };
}

async function call(h: ReturnType<typeof harness>, body: Record<string, unknown> = {}) {
  const res = await createFoodCheckInHandler(h.deps)(
    new Request("http://localhost/food-check-in", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify({ place_id: "ChIJabc", ...north(50), accuracy_m: 20, ...body }),
    }),
  );
  return { status: res.status, headers: res.headers, body: await res.json() };
}

Deno.test("a check-in at a known spot is recorded with the place's own position", async () => {
  const h = harness();
  const logged: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => logged.push(args);
  try {
    const res = await call(h);
    assertEquals(res.status, 200);
    assertEquals(res.body, {
      visits_here: 1,
      total_check_ins: 35,
      healthy: true,
      region: { id: REGION_ID, name: "Ocean Park", done: 3, total: 3, claimed: true },
      claimed_now: true,
    });
  } finally {
    console.error = original;
  }
  assertEquals(h.records, [{
    userId: USER,
    placeId: "ChIJabc",
    placeName: "Bay Bowls",
    placeLat: PLACE.lat,
    placeLng: PLACE.lng,
    regionId: REGION_ID,
    healthy: true,
  }]);
  assertEquals(h.regionQueries[0]!.lat, PLACE.lat, "regions are looked up at the place");
  assertEquals(h.requests.length, 0);
  assertEquals(logged, [], "nothing is logged");
});

Deno.test("the allowed distance is 200 m plus the accuracy, capped at 100 m, inclusive", async () => {
  assertEquals(allowedDistance(0), 200);
  assertEquals(allowedDistance(40), 240);
  assertEquals(allowedDistance(1000), 300);

  const near = await call(harness(), { ...north(230), accuracy_m: 40 });
  assertEquals(near.status, 200);

  const far = await call(harness(), { ...north(450), accuracy_m: 1000 });
  assertEquals(far.status, 422);
  assertEquals(far.body.error.code, "too_far");
  assertEquals(far.body.error.details.allowed_m, 300);
  const expected = distanceMeters(north(450), PLACE);
  assertEquals(far.body.error.details.distance_m, Math.ceil(expected));

  // Inclusive: a distance equal to the allowance passes.
  const exact = distanceMeters(north(240), PLACE);
  const accuracy = exact - 200;
  if (200 + accuracy === exact) {
    const edge = await call(harness(), { ...north(240), accuracy_m: accuracy });
    assertEquals(edge.status, 200, "exactly at the limit counts");
  }
});

Deno.test("the cooldown and daily limit come back as rate_limited", async () => {
  const retryAt = new Date(NOW + 3_600_000).toISOString().replace(".000Z", "+00:00");
  for (const reason of ["cooldown", "daily"] as const) {
    const h = harness({ result: { status: "rate_limited", reason, retry_at: retryAt } });
    const res = await call(h);
    assertEquals(res.status, 429);
    assertEquals(res.body.error.code, "rate_limited");
    assertEquals(res.body.error.details, {
      retry_at: new Date(NOW + 3_600_000).toISOString(),
      reason,
    });
    assertEquals(res.headers.get("retry-after"), "3600");
  }
});

Deno.test("an unknown place is looked up once and cached; non-healthy types are recorded", async () => {
  const h = harness({
    known: null,
    regions: [],
    result: { ...ok, healthy: false, region: null, claimed_now: false },
    api: [() =>
      jsonResponse({
        id: "ChIJabc",
        displayName: { text: "Burger Barn" },
        location: { latitude: PLACE.lat, longitude: PLACE.lng },
        primaryType: "hamburger_restaurant",
        types: ["hamburger_restaurant", "restaurant"],
      })],
  });
  const res = await call(h);
  assertEquals(res.status, 200);
  assertEquals(res.body.region, null);
  const req = h.requests[0]!;
  assertEquals(req.url, `${PLACE_DETAILS_URL}ChIJabc?languageCode=en`);
  assertEquals(req.headers.get("x-goog-fieldmask"), DETAILS_FIELD_MASK);
  assertEquals(DETAILS_FIELD_MASK, "id,displayName,location,primaryType,types");
  assertEquals(h.records[0]!.healthy, false);
  assertEquals(h.records[0]!.regionId, null);
  assertEquals(h.cached[0]!.cache_key, "food_place:v1:ChIJabc");
  assertEquals(h.cached[0]!.payload.places[0]!.name, "Burger Barn");
  assertEquals(Date.parse(h.cached[0]!.expires_at), NOW + 30 * 86_400_000);
  assertEquals(h.guards.usedIn(`food_place_lookup:user:${USER}`, "day"), 1);
});

Deno.test("places that cannot be resolved are not_found", async () => {
  const noKey = await call(harness({ known: null, env: {} }));
  assertEquals([noKey.status, noKey.body.error.code], [404, "not_found"]);

  for (const status of [400, 404]) {
    const res = await call(
      harness({ known: null, api: [() => jsonResponse({ error: {} }, status)] }),
    );
    assertEquals([res.status, res.body.error.code], [404, "not_found"]);
  }
});

Deno.test("an exhausted lookup allowance is reported, not guessed", async () => {
  const h = harness({
    known: null,
    env: { GOOGLE_PLACES_API_KEY: "g", FAMARA_FOOD_CHECKIN_MONTHLY_LOOKUPS: "0" },
  });
  const res = await call(h);
  assertEquals(res.status, 503);
  assertEquals(res.body.error.details.reason, "budget");
  assertEquals(h.requests.length, 0);
  assertEquals(h.records.length, 0);
});

Deno.test("the region is the smallest containing one, preferring the spot's own region", () => {
  const big = region(REGION_ID, 0.01, "District");
  const small = region(SMALL_ID, 0.002, "Corner");
  const away: RegionCandidate = {
    ...region("00000000-0000-4000-8000-000000000003", 0.001),
    polygon: [square(0, 0, 0.001)],
  };
  assertEquals(pickRegion([big, small, away], PLACE, [])!.id, SMALL_ID);
  assertEquals(pickRegion([big, small], PLACE, [REGION_ID])!.id, REGION_ID);
  assertEquals(pickRegion([away], PLACE, []), null);
});

Deno.test("input is validated", async () => {
  for (
    const body of [
      { place_id: "" },
      { place_id: "bad id!" },
      { lat: 91 },
      { accuracy_m: -1 },
      { accuracy_m: 1001 },
    ]
  ) {
    const res = await call(harness(), body);
    assertEquals(res.status, 400, JSON.stringify(body));
    assert(!JSON.stringify(res.body).includes("34.01"), "the position is not echoed");
  }
});
