import { assert, assertAlmostEquals, assertEquals, assertThrows } from "@std/assert";
import { distanceMeters, geohashCenter, geohashEncode, geohashHalfDiagonal } from "./geo.ts";

Deno.test("geohashEncode matches the reference encoding", () => {
  assertEquals(geohashEncode(57.64911, 10.40744, 11), "u4pruydqqvj");
  assertEquals(geohashEncode(37.7749, -122.4194, 6), "9q8yyk");
  assertEquals(geohashEncode(-33.8688, 151.2093, 5), "r3gx2");
});

Deno.test("geohashCenter decodes to the middle of the cell", () => {
  const center = geohashCenter("9q8yyk");
  assertEquals(geohashEncode(center.lat, center.lng, 6), "9q8yyk");
  assert(distanceMeters(center, { lat: 37.7749, lng: -122.4194 }) < 700);
  assertThrows(() => geohashCenter("abc!"), TypeError);
});

Deno.test("distanceMeters is a great-circle distance", () => {
  assertEquals(distanceMeters({ lat: 1, lng: 1 }, { lat: 1, lng: 1 }), 0);
  // One degree of latitude is about 111.2 km.
  assertAlmostEquals(distanceMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }), 111_195, 50);
});

Deno.test("geohashHalfDiagonal reaches every corner of the cell", () => {
  const half = geohashHalfDiagonal("9q8yyk");
  // A precision-6 cell at 37.8°N is about 0.96 km × 0.61 km.
  assert(half > 500 && half < 700, String(half));
  const center = geohashCenter("9q8yyk");
  for (const [dLat, dLng] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
    const corner = { lat: center.lat + dLat * 0.00274, lng: center.lng + dLng * 0.00549 };
    assert(distanceMeters(center, corner) <= half + 1);
  }
});
