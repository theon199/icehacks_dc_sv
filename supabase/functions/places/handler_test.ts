import { assert, assertEquals } from "@std/assert";
import { HttpError } from "../_shared/http.ts";
import type { QuotaPolicy } from "../_shared/quota.ts";
import { envOf, jsonResponse, MemoryUsageGuards, scriptedFetch } from "../prices/testing.ts";
import { FIELD_MASK, TEXT_SEARCH_URL } from "./google.ts";
import {
  CACHE_TTL_MS,
  createPlacesHandler,
  normalizeQuery,
  type PlacesCacheRow,
  type PlacesDeps,
  radiusBand,
  searchKey,
} from "./handler.ts";
import type { Confirmation } from "./rank.ts";

const NOW = Date.parse("2026-11-12T18:00:00Z");
const ORIGIN = { lat: 37.7749, lng: -122.4194 };
const INPUT = { dish: "Chana Masala", dish_key: "chana-masala", ...ORIGIN, radius_m: 3000 };

const apiPlace = (id: string, northMeters: number, extra: Record<string, unknown> = {}) => ({
  id,
  displayName: { text: `Place ${id}`, languageCode: "en" },
  location: { latitude: ORIGIN.lat + northMeters / 111_195, longitude: ORIGIN.lng },
  rating: 4.4,
  userRatingCount: 120,
  priceLevel: "PRICE_LEVEL_MODERATE",
  currentOpeningHours: { openNow: true },
  formattedAddress: `${id} Main St`,
  primaryType: "indian_restaurant",
  ...extra,
});

interface Harness {
  deps: PlacesDeps;
  requests: Request[];
  cache: Map<string, PlacesCacheRow>;
  guards: MemoryUsageGuards;
  quotas: QuotaPolicy[];
  confirmationCalls: string[][];
}

function harness(options: {
  env?: Record<string, string>;
  api?: Array<(req: Request) => Response | Promise<Response>>;
  confirmations?: Map<string, Confirmation>;
  cache?: Map<string, PlacesCacheRow>;
  guards?: MemoryUsageGuards;
  quotaExceeded?: boolean;
  holder?: string;
  sleep?: (ms: number) => Promise<void>;
} = {}): Harness {
  const { fetch, requests } = scriptedFetch(options.api ?? []);
  const cache = options.cache ?? new Map<string, PlacesCacheRow>();
  const guards = options.guards ?? new MemoryUsageGuards(() => NOW);
  const quotas: QuotaPolicy[] = [];
  const confirmationCalls: string[][] = [];
  const deps: PlacesDeps = {
    env: envOf(options.env ?? { GOOGLE_PLACES_API_KEY: "g-key" }),
    caller: () =>
      Promise.resolve({
        enforceQuota: (policy) => {
          quotas.push(policy);
          return options.quotaExceeded
            ? Promise.reject(new HttpError("rate_limited", "slow down"))
            : Promise.resolve();
        },
        confirmations: (_dish, ids) => {
          confirmationCalls.push([...ids]);
          return Promise.resolve(options.confirmations ?? new Map());
        },
      }),
    service: () => ({
      guards,
      readCache: (key, nowIso) => {
        const row = cache.get(key);
        return Promise.resolve(
          row && row.expires_at > nowIso
            ? { payload: row.payload, fetched_at: row.fetched_at }
            : null,
        );
      },
      writeCache: (row) => {
        cache.set(row.cache_key, row);
        return Promise.resolve();
      },
    }),
    fetch,
    now: () => NOW,
    newId: () => options.holder ?? "holder-1",
    sleep: options.sleep ?? (() => Promise.resolve()),
  };
  return { deps, requests, cache, guards, quotas, confirmationCalls };
}

async function call(h: Harness, body: unknown = INPUT) {
  const res = await createPlacesHandler(h.deps)(
    new Request("http://localhost/places", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, headers: res.headers, body: await res.json() };
}

Deno.test("without an API key the function reports it is not configured", async () => {
  const h = harness({ env: {} });
  const res = await call(h);
  assertEquals(res.status, 200);
  assertEquals(res.body.configured, false);
  assertEquals(res.body.places, []);
  assertEquals(h.quotas, []);
});

Deno.test("a miss runs one minimal Text Search near the cell centre and caches it", async () => {
  const h = harness({
    api: [() =>
      jsonResponse({
        places: [apiPlace("p-near", 300), apiPlace("p-far", 1000), apiPlace("p-out", 7000)],
      })],
    confirmations: new Map([["p-far", { yes_count: 9, no_count: 0, my_answer: null }]]),
  });
  const res = await call(h);
  assertEquals(res.status, 200);
  assertEquals(res.body.configured, true);
  assertEquals(res.body.cached, false);
  assertEquals(res.body.places.map((p: { id: string }) => p.id), ["p-far", "p-near"]);
  const near = res.body.places[1];
  assertEquals(near.price_level, 2);
  assertEquals(near.open_now, true);
  assertEquals(near.yes_count, 0);
  assert(near.distance_m > 250 && near.distance_m < 350);

  const req = h.requests[0]!;
  assertEquals(req.url, TEXT_SEARCH_URL);
  assertEquals(req.headers.get("x-goog-api-key"), "g-key");
  assertEquals(req.headers.get("x-goog-fieldmask"), FIELD_MASK);
  const body = await req.json();
  assertEquals(body.textQuery, "chana masala restaurant");
  assertEquals(body.pageSize, 10);
  assertEquals(body.locationBias.circle.radius, 3000);
  // Centred on the geohash cell, not the caller's exact position.
  const center = body.locationBias.circle.center;
  assert(center.latitude !== ORIGIN.lat || center.longitude !== ORIGIN.lng);

  const key = searchKey(INPUT);
  const row = h.cache.get(key.cacheKey)!;
  assertEquals(row.payload.places.length, 3);
  assertEquals(Date.parse(row.expires_at), NOW + CACHE_TTL_MS);
  assertEquals(row.lat_rounded, Math.round(row.lat_rounded * 100) / 100);
  assertEquals(h.confirmationCalls, [["p-near", "p-far", "p-out"]]);
  assertEquals(h.guards.usedIn("places_search:global", "month"), 1);
  assertEquals(h.guards.leases.size, 0);
  assertEquals(h.quotas[0]?.feature, "places");
});

Deno.test("a nearby caller with an equivalent query is served from the cache", async () => {
  const h = harness({ api: [() => jsonResponse({ places: [apiPlace("p1", 100)] })] });
  await call(h);
  const again = await call(h, { ...INPUT, dish: "  chana   MASALA ", lat: ORIGIN.lat + 0.0005 });
  assertEquals(again.body.cached, true);
  assertEquals(again.body.places.map((p: { id: string }) => p.id), ["p1"]);
  assertEquals(h.requests.length, 1);
});

Deno.test("expired cache entries are searched again", async () => {
  const cache = new Map<string, PlacesCacheRow>();
  const key = searchKey(INPUT);
  cache.set(key.cacheKey, {
    cache_key: key.cacheKey,
    query: key.query,
    lat_rounded: 37.77,
    lng_rounded: -122.42,
    payload: { places: [] },
    fetched_at: new Date(NOW - CACHE_TTL_MS - 1).toISOString(),
    expires_at: new Date(NOW - 1).toISOString(),
  });
  const h = harness({ cache, api: [() => jsonResponse({ places: [apiPlace("fresh", 50)] })] });
  const res = await call(h);
  assertEquals(res.body.places[0].id, "fresh");
});

Deno.test("a concurrent search for the same key is shared instead of repeated", async () => {
  const guards = new MemoryUsageGuards(() => NOW);
  const cache = new Map<string, PlacesCacheRow>();
  const key = searchKey(INPUT);
  await guards.claimLeases([`places:${key.cacheKey}`], "other-request", 30);
  let waits = 0;
  const h = harness({
    guards,
    cache,
    holder: "me",
    sleep: () => {
      // The other request finishes while we wait.
      if (++waits === 2) {
        cache.set(key.cacheKey, {
          cache_key: key.cacheKey,
          query: key.query,
          lat_rounded: 37.77,
          lng_rounded: -122.42,
          payload: {
            places: [{
              id: "shared",
              name: "Shared",
              address: null,
              lat: ORIGIN.lat,
              lng: ORIGIN.lng,
              rating: null,
              rating_count: null,
              price_level: null,
              open_now: null,
              primary_type: null,
            }],
          },
          fetched_at: new Date(NOW).toISOString(),
          expires_at: new Date(NOW + CACHE_TTL_MS).toISOString(),
        });
      }
      return Promise.resolve();
    },
  });
  const res = await call(h);
  assertEquals(res.body.places[0].id, "shared");
  assertEquals(h.requests.length, 0);
});

Deno.test("if the shared search does not finish in time the caller is asked to retry", async () => {
  const guards = new MemoryUsageGuards(() => NOW);
  await guards.claimLeases([`places:${searchKey(INPUT).cacheKey}`], "other-request", 30);
  const res = await call(harness({ guards, holder: "me" }));
  assertEquals(res.status, 503);
  assertEquals(res.headers.get("retry-after"), "2");
});

Deno.test("an exhausted monthly budget returns no places with a notice", async () => {
  const h = harness({ env: { GOOGLE_PLACES_API_KEY: "g", FAMARA_PLACES_MONTHLY_SEARCHES: "0" } });
  const res = await call(h);
  assertEquals(res.status, 200);
  assertEquals(res.body.notice, "budget");
  assertEquals(res.body.places, []);
  assertEquals(h.requests.length, 0);
  assertEquals(h.guards.leases.size, 0);
});

Deno.test("the per-member rate limit is enforced", async () => {
  const res = await call(harness({ quotaExceeded: true }));
  assertEquals(res.status, 429);
});

Deno.test("Google errors map onto the error envelope and are not cached", async () => {
  const cases: Array<[Response | Error, number, string]> = [
    [jsonResponse({ error: { status: "PERMISSION_DENIED" } }, 403), 500, "misconfigured"],
    [jsonResponse({ error: { status: "RESOURCE_EXHAUSTED" } }, 429), 503, "upstream_unavailable"],
    [jsonResponse({ error: {} }, 500), 503, "upstream_unavailable"],
    [jsonResponse({ error: { status: "INVALID_ARGUMENT" } }, 400), 502, "upstream_error"],
    [new Response("not json"), 502, "upstream_error"],
    [new TypeError("dns"), 503, "upstream_unavailable"],
    [new DOMException("slow", "TimeoutError"), 504, "upstream_timeout"],
  ];
  for (const [outcome, status, code] of cases) {
    const h = harness({
      api: [() => (outcome instanceof Error ? Promise.reject(outcome) : outcome)],
    });
    const res = await call(h);
    assertEquals([res.status, res.body.error.code], [status, code]);
    assertEquals(h.cache.size, 0);
    assertEquals(h.guards.leases.size, 0, "the lease is released after a failure");
  }
});

Deno.test("malformed places are skipped and an empty result is cached", async () => {
  const h = harness({
    api: [
      () =>
        jsonResponse({ places: [{ id: "no-location" }, apiPlace("ok", 10), apiPlace("ok", 10)] }),
    ],
  });
  const res = await call(h);
  assertEquals(res.body.places.map((p: { id: string }) => p.id), ["ok"]);

  const empty = harness({ api: [() => jsonResponse({})] });
  const none = await call(empty);
  assertEquals(none.body.places, []);
  assertEquals(empty.cache.size, 1);
  assertEquals(empty.confirmationCalls, [], "no confirmation lookup for an empty result");
});

Deno.test("input is validated", async () => {
  for (
    const body of [
      { ...INPUT, radius_m: 9000 },
      { ...INPUT, lat: 91 },
      { ...INPUT, dish: "x" },
      { ...INPUT, dish_key: "Not A Key" },
      { ...INPUT, limit: 11 },
    ]
  ) {
    const res = await call(harness(), body);
    assertEquals(res.status, 400, JSON.stringify(body));
  }
});

Deno.test("query normalisation and radius bands", () => {
  assertEquals(normalizeQuery("Pad  Thai!"), "pad thai restaurant");
  assertEquals(radiusBand(500), 1000);
  assertEquals(radiusBand(3001), 4000);
  assertEquals(radiusBand(8000), 8000);
});
