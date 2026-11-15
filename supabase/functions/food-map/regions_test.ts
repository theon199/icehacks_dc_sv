import { assert, assertEquals } from "@std/assert";
import {
  geohashCenter,
  geohashEncode,
  pointInPolygon,
  polygonArea,
  signedRingArea,
} from "./geo.ts";
import type { OsmArea } from "./overpass.ts";
import {
  buildRegions,
  cellHasPolygons,
  cleanOsmAreas,
  gridName,
  gridRegions,
  isSliver,
  nearestName,
  simplifyPolygon,
} from "./regions.ts";
import { circleRing, square } from "./testing.ts";

const CELL = "9q5c2";
const C = geohashCenter(CELL);
const area = (ref: string, name: string, ring = square(C.lng, C.lat, 0.004)): OsmArea => ({
  ref,
  name,
  polygon: [ring],
});

Deno.test("polygons are simplified to at most 200 closed points", () => {
  const big = circleRing(C.lng, C.lat, 0.01, 900);
  const hole = circleRing(C.lng, C.lat, 0.002, 300).reverse();
  const simple = simplifyPolygon([big, hole])!;
  const points = simple.reduce((sum, ring) => sum + ring.length, 0);
  assert(points <= 200, `${points} points`);
  for (const ring of simple) {
    assert(ring.length >= 4);
    assertEquals(ring[0], ring[ring.length - 1]);
  }
  assert(signedRingArea(simple[0]!) > 0, "outline counter-clockwise");
  if (simple[1]) assert(signedRingArea(simple[1]) < 0, "holes clockwise");
  const ratio = polygonArea(simple) / polygonArea([big, hole]);
  assert(ratio > 0.97 && ratio < 1.03, `area kept (${ratio})`);
  assertEquals(simplifyPolygon([square(0, 0, 0.01)])!.length, 1, "small polygons pass through");
});

Deno.test("slivers are dropped", () => {
  assert(isSliver([square(C.lng, C.lat, 0.0005)]), "under 2 ha");
  assert(
    isSliver([[[0, 0], [0.05, 0], [0.05, 0.0004], [0, 0.0004], [0, 0]]]),
    "long and thin",
  );
  assert(!isSliver([square(C.lng, C.lat, 0.004)]));
});

Deno.test("overlapping admin levels keep the smaller areas", () => {
  const district = area("osm:relation:1", "District", square(C.lng, C.lat, 0.01));
  const west = area("osm:relation:2", "West", square(C.lng - 0.005, C.lat, 0.004));
  const east = area("osm:relation:3", "East", square(C.lng + 0.005, C.lat, 0.004));
  const duplicate = area("osm:way:4", "East", square(C.lng + 0.005, C.lat, 0.0041));
  const apart = area("osm:relation:5", "Apart", square(C.lng + 0.05, C.lat, 0.004));
  const kept = cleanOsmAreas([district, west, east, duplicate, apart]);
  assertEquals(kept.map((k) => k.area.ref).sort(), [
    "osm:relation:2",
    "osm:relation:3",
    "osm:relation:5",
  ]);
});

Deno.test("a parent mostly outside its children is kept", () => {
  const district = area("osm:relation:1", "District", square(C.lng, C.lat, 0.01));
  const corner = area("osm:relation:2", "Corner", square(C.lng + 0.008, C.lat + 0.008, 0.002));
  assertEquals(cleanOsmAreas([district, corner]).length, 2);
});

Deno.test("cells covered by OSM areas get those areas; the rest get a named grid", () => {
  const ocean = area("osm:relation:9", "Ocean Park");
  const neighbour = geohashEncode(C.lat, C.lng + 0.05, 5);
  const built = buildRegions([CELL, neighbour], [ocean], []);
  const own = built.get(CELL)!;
  assertEquals(own.map((r) => [r.source, r.source_ref, r.name, r.geohash5]), [
    ["osm", "osm:relation:9", "Ocean Park", CELL],
  ]);
  const grid = built.get(neighbour)!;
  assertEquals(grid.length, 32);
  assert(grid.every((r) => r.source === "grid" && r.geohash5 === neighbour));
  assertEquals(grid[0]!.source_ref, `grid:${neighbour}0`);
  assertEquals(grid[0]!.name, `Near Ocean Park ${neighbour.slice(-2).toUpperCase()}0`);
  assert(pointInPolygon(geohashCenter(`${neighbour}0`), grid[0]!.polygon));
});

Deno.test("grid names are deterministic", () => {
  assertEquals(gridName("9q5c2k", null), "Area C2K");
  assertEquals(gridName("9q5c2k", "Ocean Park"), "Near Ocean Park C2K");
  assertEquals(gridName("9q5c2k", "x".repeat(200)).length, 120);
  assertEquals(gridRegions(CELL, null)[31]!.name, "Area C2Z");
  const places = [
    { source_ref: "osm:relation:2", name: "Bee", bbox: [C.lng, C.lat, C.lng, C.lat] as const },
    { source_ref: "osm:relation:1", name: "Ay", bbox: [C.lng, C.lat, C.lng, C.lat] as const },
    {
      source_ref: "osm:relation:3",
      name: "Far",
      bbox: [C.lng + 1, C.lat, C.lng + 1, C.lat] as const,
    },
  ].map((p) => ({ ...p, bbox: [...p.bbox] as [number, number, number, number] }));
  assertEquals(nearestName(CELL, places), "Ay", "ties go to the lower source ref");
  assertEquals(nearestName(CELL, places.slice(2)), null, "nothing within 10 km");
});

Deno.test("a cell is left without a grid only when a region that will be served covers it", () => {
  // A large area that reaches into CELL but whose centre is in the cell to the east.
  const east = geohashEncode(C.lat, C.lng + 0.044, 5);
  const wide = area("osm:relation:7", "Wide Park", square(C.lng + 0.06, C.lat, 0.05));
  assertEquals(geohashEncode(C.lat, C.lng + 0.06, 5), east, "fixture: centred in the east cell");
  assert(cellHasPolygons(CELL, [wide.polygon]), "fixture: the area reaches into CELL");

  const alone = buildRegions([CELL], [wide], []).get(CELL)!;
  assertEquals(alone.length, 32, "not stored with this fill, so CELL falls back to the grid");
  assert(alone.every((r) => r.source === "grid"));

  const together = buildRegions([CELL, east], [wide], []);
  assertEquals(together.get(CELL), [], "stored in the adjacent cell, so CELL is covered");
  assertEquals(together.get(east)!.map((r) => r.source_ref), ["osm:relation:7"]);

  const stored = {
    source_ref: "osm:relation:7",
    name: "Wide Park",
    geohash5: east,
    polygon: wide.polygon,
    bbox: [C.lng + 0.01, C.lat - 0.05, C.lng + 0.11, C.lat + 0.05] as [
      number,
      number,
      number,
      number,
    ],
  };
  assertEquals(
    buildRegions([CELL], [wide], [stored]).get(CELL),
    [],
    "already stored in the adjacent cell, so CELL is covered",
  );
  const farCell = geohashEncode(C.lat, C.lng + 0.2, 5);
  assertEquals(
    buildRegions([CELL], [wide], [{ ...stored, geohash5: farCell }]).get(CELL)!.length,
    32,
    "a stored region centred beyond the neighbours is not served with CELL",
  );
});

Deno.test("coverage is judged by geohash-6 centres", () => {
  assert(cellHasPolygons(CELL, [[square(C.lng, C.lat, 0.004)]]));
  assert(!cellHasPolygons(CELL, [[square(C.lng + 1, C.lat, 0.004)]]));
});
