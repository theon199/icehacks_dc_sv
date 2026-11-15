import { assert, assertAlmostEquals, assertEquals, assertRejects } from "@std/assert";
import { HttpError } from "../_shared/http.ts";
import { jsonResponse, scriptedFetch } from "../prices/testing.ts";
import { distanceMeters, type Polygon } from "./geo.ts";
import { EXCLUDED_TYPES, HEALTHY_TYPES, isHealthyLeaning } from "./healthy.ts";
import {
  chooseSpots,
  NEARBY_FIELD_MASK,
  NEARBY_SEARCH_URL,
  type NearbyPlace,
  searchCircle,
  searchNearby,
  spotScore,
  toNearbyPlace,
} from "./nearby.ts";
import { square } from "./testing.ts";

const REGION: Polygon = [square(-118.49, 34.01, 0.005)];

const place = (id: string, extra: Partial<NearbyPlace> = {}): NearbyPlace => ({
  place_id: id,
  name: `Place ${id}`,
  lat: 34.01,
  lng: -118.49,
  primary_type: "salad_shop",
  types: ["salad_shop", "restaurant", "food"],
  rating: 4.5,
  rating_count: 100,
  photos: [],
  ...extra,
});

Deno.test("the healthy-leaning rule", () => {
  assert(isHealthyLeaning("salad_shop", []));
  assert(isHealthyLeaning("restaurant", ["vietnamese_restaurant", "restaurant"]));
  assert(isHealthyLeaning(null, ["greek_restaurant"]));
  assert(!isHealthyLeaning("restaurant", ["restaurant", "food"]), "generic restaurants are not");
  assert(!isHealthyLeaning("japanese_restaurant", ["fast_food_restaurant"]), "fast food wins");
  assert(!isHealthyLeaning("pizza_restaurant", ["mediterranean_restaurant"]));
  assert(!isHealthyLeaning("dessert_shop", ["vegan_restaurant"]));
  assert(!isHealthyLeaning(null, []));
  assert(HEALTHY_TYPES.length <= 50 && EXCLUDED_TYPES.length <= 50, "within the API's limits");
});

Deno.test("spots are healthy places inside the polygon, best rated first, at most five", () => {
  const places = [
    place("a", { rating: 4.9, rating_count: 10 }),
    place("b", { rating: 4.4, rating_count: 900 }),
    place("outside", { lat: 34.03, rating: 5, rating_count: 5000 }),
    place("pizza", { primary_type: "pizza_restaurant", types: ["pizza_restaurant"] }),
    place("c", { rating: 4.0, rating_count: 200 }),
    place("d", { rating: null, rating_count: null }),
    place("e", { rating: 4.0, rating_count: 200 }),
    place("f", { rating: 3.0, rating_count: 50 }),
    place("g", { rating: 2.0, rating_count: 20 }),
    place("b", { rating: 1, rating_count: 1 }),
  ];
  const spots = chooseSpots(places, REGION);
  assertEquals(spots.map((s) => s.place_id), ["b", "c", "e", "f", "a"]);
  assertEquals(spots.map((s) => s.rank), [1, 2, 3, 4, 5]);
  assertAlmostEquals(spotScore({ rating: 4.4, rating_count: 900 }), 4.4 * Math.log(901), 1e-9);
  assertEquals(spotScore({ rating: null, rating_count: null }), 0);
});

Deno.test("API places keep up to three photos with their author attributions", () => {
  const photo = (n: number) => ({
    name: `places/abc/photos/p${n}`,
    widthPx: 1200,
    heightPx: 900,
    authorAttributions: [{
      displayName: "Ana R.",
      uri: "https://maps.google.com/ana",
      photoUri: "x",
    }],
  });
  const parsed = toNearbyPlace({
    id: "abc",
    displayName: { text: " Bay Bowls " },
    location: { latitude: 34, longitude: -118 },
    primaryType: "salad_shop",
    types: ["salad_shop"],
    rating: 4.6,
    userRatingCount: 321,
    photos: [photo(1), { name: "not a photo" }, photo(2), photo(3), photo(4)],
  })!;
  assertEquals(parsed.name, "Bay Bowls");
  assertEquals(parsed.photos.map((p) => p.name), [
    "places/abc/photos/p1",
    "places/abc/photos/p2",
    "places/abc/photos/p3",
  ]);
  assertEquals(parsed.photos[0]!.attributions, [
    { display_name: "Ana R.", uri: "https://maps.google.com/ana" },
  ]);
  assertEquals(toNearbyPlace({ id: "x", location: { latitude: 0, longitude: 0 } }), null);
});

Deno.test("one Nearby Search restricted to the region's covering circle", async () => {
  const { fetch, requests } = scriptedFetch([() =>
    jsonResponse({
      places: [{
        id: "p1",
        displayName: { text: "Greens" },
        location: { latitude: 34.01, longitude: -118.49 },
        types: ["vegan_restaurant"],
      }],
    })]);
  const box: [number, number, number, number] = [-118.495, 34.005, -118.485, 34.015];
  const places = await searchNearby({ box, apiKey: "g-key", fetch });
  assertEquals(places.map((p) => p.place_id), ["p1"]);
  const req = requests[0]!;
  assertEquals(req.url, NEARBY_SEARCH_URL);
  assertEquals(req.headers.get("x-goog-api-key"), "g-key");
  assertEquals(req.headers.get("x-goog-fieldmask"), NEARBY_FIELD_MASK);
  assertEquals(
    NEARBY_FIELD_MASK,
    "places.id,places.displayName,places.location,places.primaryType,places.types,places.photos,places.rating,places.userRatingCount",
  );
  const body = await req.json();
  assertEquals(body.includedTypes, [...HEALTHY_TYPES]);
  assertEquals(body.excludedTypes, [...EXCLUDED_TYPES]);
  assertEquals(body.maxResultCount, 20);
  const circle = body.locationRestriction.circle;
  const corner = { lat: box[1], lng: box[0] };
  assert(
    distanceMeters({ lat: circle.center.latitude, lng: circle.center.longitude }, corner) <=
      circle.radius,
    "the circle covers the box",
  );
  assertEquals(searchCircle([0, 0, 0, 0]).radiusM, 50);
  assertEquals(searchCircle([-10, -10, 10, 10]).radiusM, 50_000);
});

Deno.test("Nearby Search failures map onto the envelope", async () => {
  const cases: Array<[Response | Error, string]> = [
    [jsonResponse({ error: {} }, 403), "misconfigured"],
    [jsonResponse({ error: {} }, 429), "upstream_unavailable"],
    [jsonResponse({ error: {} }, 503), "upstream_unavailable"],
    [jsonResponse({ error: {} }, 400), "upstream_error"],
    [new Response("nope"), "upstream_error"],
    [new TypeError("dns"), "upstream_unavailable"],
    [new DOMException("slow", "TimeoutError"), "upstream_timeout"],
  ];
  for (const [outcome, code] of cases) {
    const { fetch } = scriptedFetch([
      () => outcome instanceof Error ? Promise.reject(outcome) : outcome,
    ]);
    const error = await assertRejects(
      () => searchNearby({ box: [0, 0, 0.01, 0.01], apiKey: "k", fetch }),
      HttpError,
    );
    assertEquals(error.code, code);
  }
});
