import { assert, assertEquals, assertRejects } from "@std/assert";
import { HttpError } from "../_shared/http.ts";
import { jsonResponse, scriptedFetch } from "../prices/testing.ts";
import { pointInPolygon } from "./geo.ts";
import { assembleRings, fetchOsmAreas, overpassQuery, parseOverpass } from "./overpass.ts";
import { circleRing, geom, relationElement, square } from "./testing.ts";

Deno.test("the query asks for admin levels 9-10 and place areas inside the box", () => {
  const q = overpassQuery([-118.5, 34, -118.45, 34.05]);
  assert(q.startsWith("[out:json][timeout:30];"));
  assert(q.includes('relation["boundary"="administrative"]["admin_level"~"^(9|10)$"]["name"]'));
  assert(q.includes('relation["place"~"^(neighbourhood|quarter|suburb)$"]["name"]'));
  assert(q.includes('way["place"~"^(neighbourhood|quarter|suburb)$"]["name"]'));
  assert(q.includes("(34.000000,-118.500000,34.050000,-118.450000)"), "south,west,north,east");
  assert(q.trimEnd().endsWith("out geom;"));
});

Deno.test("ways are joined end to end into closed rings, reversing where needed", () => {
  const ring = square(0, 0, 0.01);
  const a = ring.slice(0, 3);
  const b = ring.slice(2, 4).reverse();
  const c = ring.slice(3);
  const rings = assembleRings([a, b, c, [[5, 5], [6, 6]]]);
  assertEquals(rings.length, 1, "the dangling way is dropped");
  assertEquals(rings[0]!.length, 5);
  assertEquals(rings[0]![0], rings[0]![4]);
});

Deno.test("a relation becomes its largest outline with the holes inside it", () => {
  const outline = circleRing(0, 0, 0.02, 40);
  const exclave = square(1, 1, 0.001);
  const hole = square(0, 0, 0.002);
  const rel = relationElement(7, "Ocean Park", outline, { holes: [hole, square(3, 3, 0.001)] });
  rel.members.push({ type: "way", ref: 99, role: "outer", geometry: geom(exclave) });
  const [area] = parseOverpass({ elements: [rel] });
  assertEquals(area!.ref, "osm:relation:7");
  assertEquals(area!.name, "Ocean Park");
  assertEquals(area!.polygon.length, 2, "outline plus the one hole inside it");
  assert(pointInPolygon({ lat: 0.01, lng: 0 }, area!.polygon));
  assert(!pointInPolygon({ lat: 0, lng: 0 }, area!.polygon));
});

Deno.test("unnamed, incomplete and duplicate elements are skipped; closed place ways count", () => {
  const incomplete = relationElement(2, "Half", circleRing(0, 0, 0.01, 12));
  (incomplete.members[1] as { geometry: unknown[] }).geometry.push(null);
  const areas = parseOverpass({
    elements: [
      { ...relationElement(1, "x", square(0, 0, 0.01)), tags: { boundary: "administrative" } },
      incomplete,
      relationElement(3, "  Mid   City ", square(0, 0, 0.01)),
      relationElement(3, "Mid City", square(0, 0, 0.01)),
      {
        type: "way",
        id: 4,
        tags: { place: "quarter", name: "Wilshire" },
        geometry: geom(square(0, 0, 0.01)),
      },
      {
        type: "way",
        id: 5,
        tags: { place: "quarter", name: "Open" },
        geometry: geom(square(0, 0, 0.01).slice(0, 4)),
      },
      { type: "node", id: 6, tags: { place: "neighbourhood", name: "Point" }, lat: 0, lon: 0 },
    ],
  });
  assertEquals(areas.map((a) => [a.ref, a.name]), [
    ["osm:relation:3", "Mid City"],
    ["osm:way:4", "Wilshire"],
  ]);
});

Deno.test("an unexpected response shape is an upstream error", () => {
  try {
    parseOverpass({ remark: "runtime error" });
    throw new Error("expected a failure");
  } catch (error) {
    assert(error instanceof HttpError);
    assertEquals(error.code, "upstream_error");
  }
});

Deno.test("requests identify Famara and errors map onto the envelope", async () => {
  const { fetch, requests } = scriptedFetch([() => jsonResponse({ elements: [] })]);
  await fetchOsmAreas({
    box: [0, 0, 1, 1],
    url: "https://overpass.test/api",
    userAgent: "Famara-Test",
    fetch,
  });
  const req = requests[0]!;
  assertEquals(req.method, "POST");
  assertEquals(req.headers.get("user-agent"), "Famara-Test");
  const body = new URLSearchParams(await req.text());
  assert(body.get("data")!.includes("out geom;"));

  const cases: Array<[Response | Error, string]> = [
    [
      new Response("busy", { status: 429, headers: { "retry-after": "60" } }),
      "upstream_unavailable",
    ],
    [new Response("gateway", { status: 504 }), "upstream_unavailable"],
    [new Response("bad", { status: 400 }), "upstream_error"],
    [new Response("not json"), "upstream_error"],
    [new TypeError("dns"), "upstream_unavailable"],
    [new DOMException("slow", "TimeoutError"), "upstream_timeout"],
  ];
  for (const [outcome, code] of cases) {
    const scripted = scriptedFetch([
      () => outcome instanceof Error ? Promise.reject(outcome) : outcome,
    ]);
    const error = await assertRejects(
      () =>
        fetchOsmAreas({
          box: [0, 0, 1, 1],
          url: "https://o.test",
          userAgent: "UA",
          fetch: scripted.fetch,
        }),
      HttpError,
    );
    assertEquals(error.code, code);
  }
});
