import { assertEquals } from "@std/assert";
import { confirmation, type Place, proximity, rankPlaces } from "./rank.ts";

const ORIGIN = { lat: 40.0, lng: -75.0 };
// About 111 m per 0.001 degree of latitude.
const place = (id: string, northMeters: number, extra: Partial<Place> = {}): Place => ({
  id,
  name: id,
  address: null,
  lat: ORIGIN.lat + northMeters / 111_195,
  lng: ORIGIN.lng,
  rating: null,
  rating_count: null,
  price_level: null,
  open_now: null,
  primary_type: null,
  ...extra,
});

Deno.test("proximity and confirmation factors", () => {
  assertEquals(proximity(0), 1);
  assertEquals(proximity(1000), 0.5);
  assertEquals(confirmation(0, 0), 0.5);
  assertEquals(confirmation(3, 1), 4 / 6);
});

Deno.test("with no answers places are ordered by distance", () => {
  const ranked = rankPlaces(
    [place("far", 3000), place("near", 200), place("mid", 1000)],
    new Map(),
    ORIGIN,
    5000,
    10,
  );
  assertEquals(ranked.map((p) => p.id), ["near", "mid", "far"]);
  assertEquals(ranked[0]?.yes_count, 0);
  assertEquals(ranked[0]?.my_answer, null);
});

Deno.test("confirmations lift a place above a nearer one", () => {
  const ranked = rankPlaces(
    [place("near", 300), place("confirmed", 900)],
    new Map([["confirmed", { yes_count: 12, no_count: 0, my_answer: true }]]),
    ORIGIN,
    5000,
    10,
  );
  assertEquals(ranked.map((p) => p.id), ["confirmed", "near"]);
  assertEquals(ranked[0]?.my_answer, true);
});

Deno.test("'no' answers push a place down", () => {
  const ranked = rankPlaces(
    [place("denied", 100), place("other", 400)],
    new Map([["denied", { yes_count: 0, no_count: 8, my_answer: null }]]),
    ORIGIN,
    5000,
    10,
  );
  assertEquals(ranked.map((p) => p.id), ["other", "denied"]);
});

Deno.test("places outside the radius are dropped and the limit applies", () => {
  const ranked = rankPlaces(
    [place("a", 100), place("b", 200), place("c", 300), place("outside", 6000)],
    new Map(),
    ORIGIN,
    5000,
    2,
  );
  assertEquals(ranked.map((p) => p.id), ["a", "b"]);
  assertEquals(ranked[0]?.distance_m, 100);
});

Deno.test("equal scores fall back to rating, then distance", () => {
  const ranked = rankPlaces(
    [
      place("plain", 500, { rating: 3.5, rating_count: 200 }),
      place("loved", 500, { rating: 4.8, rating_count: 900 }),
    ],
    new Map(),
    ORIGIN,
    5000,
    10,
  );
  assertEquals(ranked.map((p) => p.id), ["loved", "plain"]);
});
