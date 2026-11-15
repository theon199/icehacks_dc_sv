import { assert, assertEquals } from "@std/assert";
import { envOf, jsonResponse, MemoryUsageGuards, scriptedFetch } from "../prices/testing.ts";
import { cellWithNeighbours, geohashCenter } from "./geo.ts";
import {
  type Area,
  createFoodMapHandler,
  type FoodMapDeps,
  type Mine,
  type MineQuery,
  REGION_TTL_SECONDS,
  SPOT_TTL_SECONDS,
  type StoredRegion,
} from "./handler.ts";
import { NEARBY_SEARCH_URL } from "./nearby.ts";
import type { RegionDraft } from "./regions.ts";
import { relationElement, square } from "./testing.ts";

const NOW = Date.parse("2026-11-14T18:00:00Z");
const ORIGIN = { lat: 34.0195, lng: -118.4912 };
const CELLS = cellWithNeighbours(ORIGIN.lat, ORIGIN.lng, 5);
const OWN = geohashCenter(CELLS[0]!);
const USER = "aaaaaaaa-0000-4000-8000-000000000001";

/** In-memory stand-in for the food map RPCs with the same semantics. */
class MemoryFoodMap {
  cells = new Map<string, string>();
  regions = new Map<string, StoredRegion & { retired: boolean }>();
  storedCalls: string[][] = [];
  spotCalls: string[] = [];
  private nextId = 1;

  constructor(private readonly now: () => number) {}

  area(cells: readonly string[]): Promise<Area> {
    return Promise.resolve(structuredClone({
      cells: [...this.cells].filter(([c]) => cells.includes(c)).map(([geohash5, expires_at]) => ({
        geohash5,
        expires_at,
      })),
      regions: [...this.regions.values()]
        .filter((r) => !r.retired && cells.includes(r.geohash5))
        .map(({ retired: _retired, ...r }) => r),
    }));
  }

  storeRegions(cells: readonly string[], drafts: RegionDraft[], ttl: number): Promise<void> {
    this.storedCalls.push([...cells]);
    const refs = new Set(drafts.map((d) => d.source_ref));
    for (const d of drafts) {
      const existing = this.regions.get(d.source_ref);
      const id = existing?.id ??
        `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, "0")}`;
      this.regions.set(d.source_ref, {
        id,
        source: d.source,
        source_ref: d.source_ref,
        name: d.name,
        geohash5: d.geohash5,
        polygon: d.polygon,
        bbox: d.bbox,
        area_m2: d.area_m2,
        spots_expires_at: existing?.spots_expires_at ?? null,
        spots: existing?.spots ?? [],
        retired: false,
      });
    }
    for (const r of this.regions.values()) {
      if (cells.includes(r.geohash5) && !refs.has(r.source_ref)) r.retired = true;
    }
    const expires = new Date(this.now() + ttl * 1000).toISOString();
    for (const c of cells) this.cells.set(c, expires);
    return Promise.resolve();
  }

  storeSpots(regionId: string, spots: StoredRegion["spots"], ttl: number): Promise<void> {
    this.spotCalls.push(regionId);
    for (const r of this.regions.values()) {
      if (r.id === regionId) {
        r.spots = structuredClone(spots);
        r.spots_expires_at = new Date(this.now() + ttl * 1000).toISOString();
      }
    }
    return Promise.resolve();
  }

  /** Marks every cell filled with no regions except those given. */
  seed(regions: Array<Partial<StoredRegion> & { source_ref: string }>, cellExpiry = NOW + 1e9) {
    for (const c of CELLS) this.cells.set(c, new Date(cellExpiry).toISOString());
    for (const r of regions) {
      this.regions.set(r.source_ref, {
        id: `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, "0")}`,
        source: "osm",
        name: "Ocean Park",
        geohash5: CELLS[0]!,
        polygon: [square(OWN.lng, OWN.lat, 0.005)],
        bbox: [OWN.lng - 0.005, OWN.lat - 0.005, OWN.lng + 0.005, OWN.lat + 0.005],
        area_m2: 1_000_000,
        spots_expires_at: new Date(NOW + 1e9).toISOString(),
        spots: [],
        retired: false,
        ...r,
      });
    }
  }
}

const emptyMine = (): Mine => ({
  check_ins: [],
  claims: [],
  totals: { check_ins: 0, places: 0, claimed: 0 },
});

function harness(options: {
  env?: Record<string, string>;
  api?: Array<(req: Request) => Response | Promise<Response>>;
  store?: MemoryFoodMap;
  guards?: MemoryUsageGuards;
  mine?: Mine;
  sleep?: () => Promise<void>;
} = {}) {
  const { fetch, requests } = scriptedFetch(options.api ?? []);
  const store = options.store ?? new MemoryFoodMap(() => NOW);
  const guards = options.guards ?? new MemoryUsageGuards(() => NOW);
  const mineQueries: MineQuery[] = [];
  const deps: FoodMapDeps = {
    env: envOf(options.env ?? { GOOGLE_PLACES_API_KEY: "g-key" }),
    caller: () =>
      Promise.resolve({
        userId: USER,
        mine: (query) => {
          mineQueries.push(query);
          return Promise.resolve(options.mine ?? emptyMine());
        },
      }),
    service: () => ({
      guards,
      area: (cells) => store.area(cells),
      storeRegions: (cells, regions, ttl) => store.storeRegions(cells, regions, ttl),
      storeSpots: (id, spots, ttl) => store.storeSpots(id, spots, ttl),
    }),
    fetch,
    now: () => NOW,
    newId: () => "11111111-0000-4000-8000-000000000001",
    sleep: options.sleep ?? (() => Promise.resolve()),
  };
  return { deps, requests, store, guards, mineQueries };
}

async function call(h: ReturnType<typeof harness>, body: unknown = OWN) {
  const res = await createFoodMapHandler(h.deps)(
    new Request("http://localhost/food-map", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, headers: res.headers, body: await res.json() };
}

const nearbyPlace = (
  id: string,
  lat: number,
  lng: number,
  extra: Record<string, unknown> = {},
) => ({
  id,
  displayName: { text: `Place ${id}` },
  location: { latitude: lat, longitude: lng },
  primaryType: "salad_shop",
  types: ["salad_shop", "restaurant"],
  rating: 4.5,
  userRatingCount: 100,
  photos: [{
    name: `places/${id}/photos/ph1`,
    widthPx: 1200,
    heightPx: 900,
    authorAttributions: [{ displayName: "Ana R.", uri: "https://maps.google.com/ana" }],
  }],
  ...extra,
});

Deno.test("a cold area is filled with one Overpass query and spots for the nearest regions", async () => {
  const overpass = {
    elements: [relationElement(42, "Ocean Park", square(OWN.lng, OWN.lat, 0.005))],
  };
  const h = harness({
    env: { GOOGLE_PLACES_API_KEY: "g-key", FAMARA_OVERPASS_USER_AGENT: "Famara-Test/1" },
    api: [
      (req) => {
        assertEquals(req.headers.get("user-agent"), "Famara-Test/1");
        return jsonResponse(overpass);
      },
      // The OSM region is nearest; then the grid cells of the neighbouring cells.
      (req) => {
        assertEquals(req.url, NEARBY_SEARCH_URL);
        return jsonResponse({
          places: [
            nearbyPlace("p-in", OWN.lat, OWN.lng),
            nearbyPlace("p-out", OWN.lat + 0.02, OWN.lng),
            nearbyPlace("p-burger", OWN.lat, OWN.lng, { types: ["hamburger_restaurant"] }),
          ],
        });
      },
      ...Array.from({ length: 5 }, () => () => jsonResponse({ places: [] })),
    ],
  });
  const res = await call(h);
  assertEquals(res.status, 200);
  assertEquals(res.body.configured, true);
  assertEquals(res.body.notice, null);
  assertEquals(h.store.storedCalls.length, 1, "one fill for all nine cells");
  assertEquals(h.store.storedCalls[0]!.length, 9);

  const ocean = res.body.regions.find((r: { name: string }) => r.name === "Ocean Park");
  assertEquals(ocean.source, "osm");
  assertEquals(ocean.spots.map((s: { place_id: string }) => s.place_id), ["p-in"]);
  assertEquals(ocean.spots[0].rank, 1);
  assertEquals(ocean.spots[0].visits, 0);
  assertEquals(ocean.spots[0].photos[0].attributions[0].display_name, "Ana R.");
  assertEquals(ocean.progress, { done: 0, total: 1, claimed: false, claimed_at: null });
  assertEquals(ocean.spots_status, "ready");
  const ring = ocean.polygon[0];
  assertEquals(ring[0], ring[ring.length - 1]);

  // The neighbouring cells had no outlines, so they are covered by named grid regions.
  const grid = res.body.regions.filter((r: { source: string }) => r.source === "grid");
  assertEquals(grid.length, 8 * 32);
  assert(grid.every((r: { name: string }) => r.name.startsWith("Near Ocean Park ")));
  assertEquals(res.body.attribution, { osm: true, google: true });

  assertEquals(h.requests.length, 1 + 6, "six spot fills per request by default");
  const statuses = res.body.regions.map((r: { spots_status: string }) => r.spots_status);
  assertEquals(statuses.filter((s: string) => s === "ready").length, 6);
  assertEquals(statuses.filter((s: string) => s === "pending").length, 1 + 8 * 32 - 6);
  assertEquals(h.guards.usedIn(`food_map_spots:user:${USER}`, "day"), 6);
  assertEquals(h.guards.usedIn("food_map_spots:global", "month"), 6);
  assertEquals(h.guards.usedIn("food_map_area:global", "day"), 1);
  assertEquals(h.guards.leases.size, 0, "leases are released");
});

Deno.test("a warm area makes no upstream calls and merges the caller's progress", async () => {
  const store = new MemoryFoodMap(() => NOW);
  store.seed([{
    source_ref: "osm:relation:1",
    spots: [
      {
        place_id: "a",
        name: "A",
        lat: OWN.lat,
        lng: OWN.lng,
        primary_type: null,
        rank: 1,
        photos: [],
      },
      {
        place_id: "b",
        name: "B",
        lat: OWN.lat,
        lng: OWN.lng,
        primary_type: null,
        rank: 2,
        photos: [],
      },
    ],
  }]);
  const regionId = [...store.regions.values()][0]!.id;
  const h = harness({
    store,
    mine: {
      check_ins: [{
        place_id: "a",
        place_name: "A",
        lat: OWN.lat,
        lng: OWN.lng,
        region_id: regionId,
        healthy: true,
        visits: 3,
        times: ["2026-11-09 19:12:00+00", "2026-11-10T08:00:00+00:00", "2026-11-01T08:00:00Z"],
      }],
      claims: [{ region_id: regionId, claimed_at: "2026-11-10T08:00:00+00:00" }],
      totals: { check_ins: 34, places: 11, claimed: 2 },
    },
  });
  const res = await call(h);
  assertEquals(h.requests.length, 0);
  const [region] = res.body.regions;
  assertEquals(region.progress, {
    done: 1,
    total: 2,
    claimed: true,
    claimed_at: "2026-11-10T08:00:00.000Z",
  });
  assertEquals(region.spots.map((s: { visits: number }) => s.visits), [3, 0]);
  assertEquals(region.spots_status, "ready");
  assertEquals(res.body.check_ins[0].times, [
    "2026-11-10T08:00:00.000Z",
    "2026-11-09T19:12:00.000Z",
    "2026-11-01T08:00:00.000Z",
  ]);
  assertEquals(res.body.totals, { check_ins: 34, places: 11, claimed: 2 });
  assertEquals(h.mineQueries[0]!.regionIds, [regionId]);
  assertEquals(h.mineQueries[0]!.placeIds, ["a", "b"]);
  assertEquals(h.mineQueries[0]!.box, region.bbox);
});

Deno.test("without an API key regions still come back with no spots", async () => {
  const store = new MemoryFoodMap(() => NOW);
  store.seed([{
    source_ref: "osm:relation:1",
    spots_expires_at: null,
    spots: [{ place_id: "a", name: "A", lat: 0, lng: 0, primary_type: null, rank: 1, photos: [] }],
  }]);
  const h = harness({ store, env: {} });
  const res = await call(h);
  assertEquals(res.status, 200);
  assertEquals(res.body.configured, false);
  assertEquals(res.body.notice, null);
  assertEquals(res.body.regions.length, 1);
  assertEquals(res.body.regions[0].spots, []);
  assertEquals(res.body.regions[0].progress.total, 0);
  assertEquals(res.body.regions[0].spots_status, "unavailable");
  assertEquals(res.body.attribution, { osm: true, google: false });
  assertEquals(Object.keys(res.body).sort(), [
    "attribution",
    "check_ins",
    "configured",
    "notice",
    "regions",
    "totals",
  ]);
  assertEquals(h.requests.length, 0);
});

Deno.test("an exhausted spot budget returns the regions with a notice", async () => {
  const store = new MemoryFoodMap(() => NOW);
  store.seed([{ source_ref: "osm:relation:1", spots_expires_at: null }]);
  const h = harness({
    store,
    env: { GOOGLE_PLACES_API_KEY: "g", FAMARA_FOOD_MAP_MONTHLY_FILLS: "0" },
  });
  const res = await call(h);
  assertEquals(res.status, 200);
  assertEquals(res.body.notice, "budget");
  assertEquals(res.body.regions[0].spots, []);
  assertEquals(res.body.regions[0].spots_status, "unavailable");
  assertEquals(h.requests.length, 0);
  assertEquals(h.guards.usedIn(`food_map_spots:user:${USER}`, "day"), 0, "member units given back");
  assertEquals(h.guards.leases.size, 0);
});

Deno.test("expired spot lists are refilled; failed fills give their units back", async () => {
  const store = new MemoryFoodMap(() => NOW);
  store.seed([
    { source_ref: "osm:relation:1", spots_expires_at: new Date(NOW - 1).toISOString() },
    {
      source_ref: "osm:relation:2",
      name: "Far",
      spots_expires_at: null,
      bbox: [OWN.lng + 0.02, OWN.lat, OWN.lng + 0.03, OWN.lat + 0.01],
    },
  ]);
  const h = harness({
    store,
    api: [
      () => jsonResponse({ places: [nearbyPlace("fresh", OWN.lat, OWN.lng)] }),
      () => jsonResponse({ error: {} }, 503),
    ],
  });
  const res = await call(h);
  const ocean = res.body.regions.find((r: { name: string }) => r.name === "Ocean Park");
  assertEquals(ocean.spots[0].place_id, "fresh");
  assertEquals(ocean.spots_status, "ready");
  const far = res.body.regions.find((r: { name: string }) => r.name === "Far");
  assertEquals(far.spots_status, "pending", "a failed fill is tried again on a later view");
  const regionId = store.regions.get("osm:relation:1")!.id;
  assertEquals(
    Date.parse(store.regions.get("osm:relation:1")!.spots_expires_at!),
    NOW + SPOT_TTL_SECONDS * 1000,
  );
  assertEquals(store.spotCalls, [regionId], "the failed region is not stored");
  assertEquals(h.guards.usedIn("food_map_spots:global", "month"), 1);
});

Deno.test("a search that ran keeps its units even when storing the spots fails", async () => {
  class FailingStore extends MemoryFoodMap {
    override storeSpots(): Promise<void> {
      return Promise.reject(new Error("write failed"));
    }
  }
  const store = new FailingStore(() => NOW);
  store.seed([{ source_ref: "osm:relation:1", spots_expires_at: null }]);
  const h = harness({
    store,
    api: [() => jsonResponse({ places: [nearbyPlace("fresh", OWN.lat, OWN.lng)] })],
  });
  const res = await call(h);
  assertEquals(res.status, 200);
  assertEquals(res.body.regions[0].spots_status, "pending");
  assertEquals(h.requests.length, 1, "the search ran");
  assertEquals(h.guards.usedIn(`food_map_spots:user:${USER}`, "day"), 1, "member units kept");
  assertEquals(h.guards.usedIn("food_map_spots:global", "month"), 1, "global units kept");
  assertEquals(h.guards.leases.size, 0, "the lease is released");
});

Deno.test("an expired area is refreshed; a failed refresh serves what is stored", async () => {
  const store = new MemoryFoodMap(() => NOW);
  store.seed([{ source_ref: "osm:relation:1" }], NOW - 1);
  const h = harness({ store, api: [() => new Response("busy", { status: 504 })] });
  const res = await call(h);
  assertEquals(res.status, 200);
  assertEquals(res.body.regions.length, 1);
  assertEquals(h.requests.length, 1);
});

Deno.test("a cold area whose fill fails is an error, and nothing is marked filled", async () => {
  const h = harness({ api: [() => new Response("busy", { status: 429 })] });
  const res = await call(h);
  assertEquals(res.status, 503);
  assertEquals(res.body.error.code, "upstream_unavailable");
  assertEquals(h.store.cells.size, 0);
  assertEquals(h.guards.leases.size, 0);
});

Deno.test("a cold area another request is filling is waited for", async () => {
  const guards = new MemoryUsageGuards(() => NOW);
  await guards.claimLeases(CELLS.map((c) => `food-map:cell:${c}`), "other", 90);
  const store = new MemoryFoodMap(() => NOW);
  let waits = 0;
  const h = harness({
    guards,
    store,
    env: {},
    sleep: () => {
      if (++waits === 2) store.seed([{ source_ref: "osm:relation:1" }]);
      return Promise.resolve();
    },
  });
  const res = await call(h);
  assertEquals(res.status, 200);
  assertEquals(res.body.regions.length, 1);
  assertEquals(h.requests.length, 0);

  const stuck = harness({ guards, env: {} });
  const busy = await call(stuck);
  assertEquals(busy.status, 503);
  assertEquals(busy.headers.get("retry-after"), "5");
});

Deno.test("the area allowance stops Overpass calls", async () => {
  const h = harness({ env: { FAMARA_FOOD_MAP_DAILY_AREA_FILLS: "0" } });
  const res = await call(h);
  assertEquals(res.status, 200);
  assertEquals(res.body.notice, "budget");
  assertEquals(res.body.regions, []);
  assertEquals(h.requests.length, 0);
});

Deno.test("regions are stored for 90 days and input is validated", async () => {
  assertEquals(REGION_TTL_SECONDS, 90 * 86_400);
  for (const body of [{ lat: 91, lng: 0 }, { lat: 0 }, { lat: "1", lng: 2 }]) {
    const res = await call(harness(), body);
    assertEquals(res.status, 400, JSON.stringify(body));
  }
});

Deno.test("check-ins whose place content has expired keep their visits with null name and position", async () => {
  const store = new MemoryFoodMap(() => NOW);
  store.seed([{ source_ref: "osm:relation:1" }]);
  const regionId = [...store.regions.values()][0]!.id;
  const h = harness({
    store,
    mine: {
      check_ins: [{
        place_id: "old",
        place_name: null,
        lat: null,
        lng: null,
        region_id: regionId,
        healthy: true,
        visits: 2,
        times: ["2026-08-01T12:00:00Z", "2026-08-02T12:00:00Z"],
      }],
      claims: [],
      totals: { check_ins: 2, places: 1, claimed: 0 },
    },
  });
  const res = await call(h);
  assertEquals(res.status, 200);
  assertEquals(res.body.check_ins, [{
    place_id: "old",
    place_name: null,
    lat: null,
    lng: null,
    region_id: regionId,
    healthy: true,
    visits: 2,
    times: ["2026-08-02T12:00:00.000Z", "2026-08-01T12:00:00.000Z"],
  }]);
  assertEquals(res.body.totals.check_ins, 2);
});
