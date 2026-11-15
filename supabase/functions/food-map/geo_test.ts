import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import {
  bboxCircle,
  cellWithNeighbours,
  distanceMeters,
  distanceToBBox,
  EARTH_RADIUS_M,
  geohashBounds,
  geohashChildren,
  geohashEncode,
  orientRing,
  pointInPolygon,
  type Polygon,
  polygonArea,
  type Ring,
  ringCentroid,
  signedRingArea,
  simplifyRing,
} from "./geo.ts";

const square = (lng: number, lat: number, half: number): Ring => [
  [lng - half, lat - half],
  [lng + half, lat - half],
  [lng + half, lat + half],
  [lng - half, lat + half],
  [lng - half, lat - half],
];

Deno.test("geohash cells and their eight neighbours", () => {
  assertEquals(geohashEncode(34.0195, -118.4912, 5), "9q59x");
  const cells = cellWithNeighbours(34.0195, -118.4912, 5);
  assertEquals(cells.length, 9);
  assertEquals(cells[0], "9q59x");
  assertEquals(new Set(cells).size, 9);
  const own = geohashBounds("9q59x");
  for (const cell of cells.slice(1)) {
    const b = geohashBounds(cell);
    const touches = b.latMin <= own.latMax + 1e-9 && b.latMax >= own.latMin - 1e-9 &&
      b.lngMin <= own.lngMax + 1e-9 && b.lngMax >= own.lngMin - 1e-9;
    assert(touches, `${cell} borders the own cell`);
  }
});

Deno.test("neighbours wrap at the antimeridian and stop at the poles", () => {
  const east = cellWithNeighbours(0, 179.99, 5);
  assertEquals(east.length, 9);
  assert(east.some((cell) => geohashBounds(cell).lngMin < -179));
  const pole = cellWithNeighbours(89.99, 0, 5);
  assertEquals(pole.length, 6);
});

Deno.test("geohash children tile their parent", () => {
  const children = geohashChildren("9q5c2");
  assertEquals(children.length, 32);
  assert(children.every((child) => child.startsWith("9q5c2") && child.length === 6));
});

Deno.test("haversine distances use the mean Earth radius", () => {
  assertEquals(EARTH_RADIUS_M, 6_371_008.8);
  const oneDegree = distanceMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
  assertAlmostEquals(oneDegree, (Math.PI / 180) * 6_371_008.8, 1e-6);
  assertEquals(distanceToBBox({ lat: 0.5, lng: 0.5 }, [0, 0, 1, 1]), 0);
  assert(distanceToBBox({ lat: 2, lng: 0.5 }, [0, 0, 1, 1]) > 100_000);
});

Deno.test("area, orientation and centroid of a square", () => {
  const ring = square(0, 0, 0.005);
  const area = polygonArea([ring]);
  // About 1.11 km on a side at the equator.
  assertAlmostEquals(area, 1_236_000, 5_000);
  assert(signedRingArea(ring) > 0, "counter-clockwise is positive");
  assert(signedRingArea(orientRing(ring, false)) < 0);
  const c = ringCentroid(ring);
  assertAlmostEquals(c.lat, 0, 1e-9);
  assertAlmostEquals(c.lng, 0, 1e-9);
  const box = bboxCircle([-0.005, -0.005, 0.005, 0.005]);
  assertAlmostEquals(box.radiusM, Math.SQRT2 * 556, 5);
});

Deno.test("point in polygon respects holes", () => {
  const polygon: Polygon = [square(0, 0, 0.01), orientRing(square(0, 0, 0.002), false)];
  assert(pointInPolygon({ lat: 0.005, lng: 0.005 }, polygon));
  assert(!pointInPolygon({ lat: 0, lng: 0 }, polygon), "inside the hole");
  assert(!pointInPolygon({ lat: 0.02, lng: 0 }, polygon));
});

Deno.test("Douglas-Peucker keeps corners and drops collinear points", () => {
  const ring: Ring = [
    [0, 0],
    [0.001, 0],
    [0.002, 0],
    [0.002, 0.001],
    [0.002, 0.002],
    [0, 0.002],
    [0, 0.001],
    [0, 0],
  ];
  const simple = simplifyRing(ring, 1)!;
  assertEquals(simple.length, 5);
  assertEquals(simple[0], simple[simple.length - 1]);
  assertEquals(simplifyRing([[0, 0], [1, 1], [0, 0]], 1), null);
});
