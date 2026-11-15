/**
 * Turning OSM areas into food map regions, and the grid fallback.
 *
 * OSM areas are cleaned in this order:
 *   1. Outlines are oriented (outline counter-clockwise, holes clockwise) and simplified with
 *      Douglas-Peucker until the whole polygon has at most 200 points.
 *   2. Slivers are dropped: under 2 ha, or so thin that 4πA/P² < 0.05.
 *   3. Overlaps between admin levels and place areas are resolved in favour of the smaller
 *      area: going from smallest to largest, an area is dropped when more than a quarter of it
 *      is already covered by kept areas.
 *
 * A geohash-5 cell keeps no grid only when an OSM region that will be served with it reaches into
 * it (an outline point inside it, or a geohash-6 child centre covered). Served means stored and
 * centred in the cell or one of its eight neighbours, the cells the map and check-ins read: a
 * region from this fill (centred in one of the filled cells, the only ones it can be stored for)
 * or one already stored for a neighbour that this fill does not refresh. Any other cell gets grid
 * regions instead: one per geohash-6 child. Grid names are deterministic:
 * "Near <name> <CODE>" where <name> is the OSM region nearest to the geohash-5 cell's centre
 * (by distance to the region's box centre, within 10 km; ties by source ref), otherwise
 * "Area <CODE>". <CODE> is the last three characters of the geohash-6 cell in capitals.
 */

import {
  type BBox,
  bboxCenter,
  cellRing,
  cellWithNeighbours,
  distanceMeters,
  geohashBounds,
  geohashCenter,
  geohashChildren,
  geohashEncode,
  type LatLng,
  orientRing,
  pointInPolygon,
  type Polygon,
  polygonArea,
  type Ring,
  ringBBox,
  ringCentroid,
  ringPerimeter,
  roundPosition,
  signedRingArea,
  simplifyRing,
} from "./geo.ts";
import type { OsmArea } from "./overpass.ts";

export const MAX_POLYGON_POINTS = 200;
const MAX_HOLES = 12;
export const MIN_AREA_M2 = 20_000;
export const MIN_COMPACTNESS = 0.05;
export const MAX_OVERLAP = 0.25;
const OVERLAP_SAMPLES = 16;
const GRID_NAME_RADIUS_M = 10_000;

export interface RegionDraft {
  source: "osm" | "grid";
  source_ref: string;
  name: string;
  geohash5: string;
  polygon: Polygon;
  bbox: BBox;
  area_m2: number;
}

function tidyRing(ring: Ring): Ring {
  const out: Ring = [];
  for (const p of ring) {
    const r = roundPosition(p);
    const last = out[out.length - 1];
    if (!last || last[0] !== r[0] || last[1] !== r[1]) out.push(r);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) out.push([...first]);
  return out;
}

const pointCount = (polygon: Polygon) => polygon.reduce((sum, ring) => sum + ring.length, 0);

function simplifyAt(polygon: Polygon, toleranceM: number): Polygon | null {
  const [outer, ...holes] = polygon;
  const simple = outer ? simplifyRing(outer, toleranceM) : null;
  const outline = simple ? tidyRing(simple) : null;
  if (!outline || outline.length < 4) return null;
  const kept = holes.flatMap((hole) => {
    const ring = simplifyRing(hole, toleranceM);
    const tidy = ring ? tidyRing(ring) : null;
    return tidy && tidy.length >= 4 ? [tidy] : [];
  });
  return [outline, ...kept];
}

/**
 * The polygon with at most `maxPoints` points, using the smallest Douglas-Peucker tolerance
 * (found by bisection) that fits. Small holes go first when even a coarse outline is too big.
 */
export function simplifyPolygon(
  polygon: Polygon,
  maxPoints = MAX_POLYGON_POINTS,
): Polygon | null {
  const [outer, ...rest] = polygon;
  if (!outer) return null;
  const origin = outer[0]![1];
  const holes = rest
    .map((hole) => ({ hole, area: Math.abs(signedRingArea(hole, origin)) }))
    .sort((a, b) => b.area - a.area)
    .slice(0, MAX_HOLES)
    .map((h) => orientRing(tidyRing(h.hole), false))
    .filter((hole) => hole.length >= 4);
  let working: Polygon = [orientRing(tidyRing(outer), true), ...holes];
  if (working[0]!.length < 4) return null;
  if (pointCount(working) <= maxPoints) return working;

  for (;;) {
    let low = 0;
    let high = 50_000;
    let best: Polygon | null = null;
    for (let step = 0; step < 40; step++) {
      const mid = (low + high) / 2;
      const candidate = simplifyAt(working, mid);
      if (!candidate) {
        high = mid; // so coarse the outline collapsed
      } else if (pointCount(candidate) <= maxPoints) {
        best = candidate;
        high = mid;
      } else {
        low = mid;
      }
    }
    if (best) return best;
    if (working.length === 1) return null;
    working = working.slice(0, -1); // drop the smallest remaining hole and try again
  }
}

export function isSliver(polygon: Polygon): boolean {
  const area = polygonArea(polygon);
  if (area < MIN_AREA_M2) return true;
  const perimeter = ringPerimeter(polygon[0]!);
  return perimeter > 0 && (4 * Math.PI * area) / (perimeter * perimeter) < MIN_COMPACTNESS;
}

interface Candidate {
  area: OsmArea;
  polygon: Polygon;
  areaM2: number;
  bbox: BBox;
}

/** Sample points on a grid over the box that fall inside the polygon. */
function samplesInside(c: Candidate): LatLng[] {
  const [w, s, e, n] = c.bbox;
  const points: LatLng[] = [];
  for (let i = 0; i < OVERLAP_SAMPLES; i++) {
    for (let j = 0; j < OVERLAP_SAMPLES; j++) {
      const p = {
        lng: w + ((i + 0.5) / OVERLAP_SAMPLES) * (e - w),
        lat: s + ((j + 0.5) / OVERLAP_SAMPLES) * (n - s),
      };
      if (pointInPolygon(p, c.polygon)) points.push(p);
    }
  }
  return points;
}

const overlaps = (a: BBox, b: BBox) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/** Simplified, sliver-free, overlap-resolved OSM regions, smallest first. */
export function cleanOsmAreas(areas: readonly OsmArea[]): Candidate[] {
  const candidates: Candidate[] = [];
  for (const area of areas) {
    const polygon = simplifyPolygon(area.polygon);
    if (!polygon || isSliver(polygon)) continue;
    candidates.push({
      area,
      polygon,
      areaM2: polygonArea(polygon),
      bbox: ringBBox(polygon[0]!),
    });
  }
  candidates.sort((a, b) => a.areaM2 - b.areaM2 || a.area.ref.localeCompare(b.area.ref));

  const kept: Candidate[] = [];
  for (const candidate of candidates) {
    const near = kept.filter((k) => overlaps(k.bbox, candidate.bbox));
    if (near.length > 0) {
      const samples = samplesInside(candidate);
      if (samples.length > 0) {
        const covered = samples.filter((p) => near.some((k) => pointInPolygon(p, k.polygon)));
        if (covered.length / samples.length > MAX_OVERLAP) continue;
      }
    }
    kept.push(candidate);
  }
  return kept;
}

function toDraft(c: Candidate): RegionDraft {
  const centroid = ringCentroid(c.polygon[0]!);
  return {
    source: "osm",
    source_ref: c.area.ref,
    name: c.area.name,
    geohash5: geohashEncode(centroid.lat, centroid.lng, 5),
    polygon: c.polygon,
    bbox: c.bbox,
    area_m2: Math.round(c.areaM2),
  };
}

/**
 * Whether any kept polygon reaches into the cell: it covers the centre of one of the cell's
 * geohash-6 children, or one of its points lies in the cell.
 */
export function cellHasPolygons(cell: string, polygons: readonly Polygon[]): boolean {
  const b = geohashBounds(cell);
  const cellBox: BBox = [b.lngMin, b.latMin, b.lngMax, b.latMax];
  const near = polygons.filter((p) => overlaps(ringBBox(p[0]!), cellBox));
  if (near.length === 0) return false;
  const pointInCell = near.some((p) =>
    p[0]!.some(([lng, lat]) =>
      lng >= b.lngMin && lng < b.lngMax && lat >= b.latMin && lat < b.latMax
    )
  );
  if (pointInCell) return true;
  return geohashChildren(cell).some((child) => {
    const center = geohashCenter(child);
    return near.some((p) => pointInPolygon(center, p));
  });
}

export interface NamedPlace {
  source_ref: string;
  name: string;
  bbox: BBox;
}

/** The OSM region whose box centre is nearest the cell centre, within 10 km. */
export function nearestName(cell: string, named: readonly NamedPlace[]): string | null {
  const center = geohashCenter(cell);
  let best: { name: string; ref: string; distance: number } | null = null;
  for (const place of named) {
    const distance = distanceMeters(center, bboxCenter(place.bbox));
    if (distance > GRID_NAME_RADIUS_M) continue;
    if (
      !best || distance < best.distance ||
      (distance === best.distance && place.source_ref < best.ref)
    ) {
      best = { name: place.name, ref: place.source_ref, distance };
    }
  }
  return best?.name ?? null;
}

/** An OSM region already stored, as read back for the cells being filled. */
export interface StoredOsmRegion extends NamedPlace {
  geohash5: string;
  polygon: Polygon;
}

/** The cell and its eight neighbours: the cells read together with it. */
function servedWith(cell: string): Set<string> {
  const center = geohashCenter(cell);
  return new Set(cellWithNeighbours(center.lat, center.lng, cell.length));
}

export function gridName(child: string, base: string | null): string {
  const code = child.slice(-3).toUpperCase();
  if (!base) return `Area ${code}`;
  const prefix = "Near ";
  const room = 120 - prefix.length - code.length - 1;
  return `${prefix}${base.slice(0, room).trim()} ${code}`;
}

export function gridRegions(cell: string, base: string | null): RegionDraft[] {
  return geohashChildren(cell).map((child) => {
    const ring = cellRing(child);
    const polygon: Polygon = [ring];
    return {
      source: "grid",
      source_ref: `grid:${child}`,
      name: gridName(child, base),
      geohash5: cell,
      polygon,
      bbox: ringBBox(ring),
      area_m2: Math.round(polygonArea(polygon)),
    };
  });
}

/**
 * The regions to store for `cells`: cleaned OSM regions centred in them, plus grid regions for
 * cells no served OSM region covers. `knownOsm` are OSM regions already stored nearby: they name
 * grid regions, and those centred outside `cells` (which this fill leaves alone) count as cover.
 */
export function buildRegions(
  cells: readonly string[],
  areas: readonly OsmArea[],
  knownOsm: readonly StoredOsmRegion[],
): Map<string, RegionDraft[]> {
  const drafts = cleanOsmAreas(areas).map(toDraft);
  const named: NamedPlace[] = [
    ...drafts.map((d) => ({ source_ref: d.source_ref, name: d.name, bbox: d.bbox })),
    ...knownOsm.filter((k) => !drafts.some((d) => d.source_ref === k.source_ref)),
  ];
  // Drafts centred outside `cells` cannot be stored by this fill, so they cover nothing.
  const stored = drafts.filter((d) => cells.includes(d.geohash5));
  const cover = [
    ...stored,
    ...knownOsm.filter((k) =>
      !cells.includes(k.geohash5) && !stored.some((d) => d.source_ref === k.source_ref)
    ),
  ];
  const byCell = new Map<string, RegionDraft[]>();
  for (const cell of cells) {
    const served = servedWith(cell);
    const polygons = cover.filter((c) => served.has(c.geohash5)).map((c) => c.polygon);
    byCell.set(
      cell,
      cellHasPolygons(cell, polygons)
        ? stored.filter((d) => d.geohash5 === cell)
        : gridRegions(cell, nearestName(cell, named)),
    );
  }
  return byCell;
}
