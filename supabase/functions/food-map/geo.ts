/**
 * Geometry for the food map: geohash cells, great-circle distances, and planar work on polygons
 * (area, point-in-polygon, Douglas-Peucker) in a local equirectangular projection, which is
 * accurate to well under a percent at neighbourhood scale.
 *
 * Coordinates in rings are [lng, lat], as in GeoJSON.
 */

export type Position = [lng: number, lat: number];
export type Ring = Position[];
/** First ring is the outline, the rest are holes. Every ring is closed (first equals last). */
export type Polygon = Ring[];
export type BBox = [minLng: number, minLat: number, maxLng: number, maxLat: number];

export interface LatLng {
  lat: number;
  lng: number;
}

/** Mean Earth radius (IUGG), shared with the app's distance check. */
export const EARTH_RADIUS_M = 6_371_008.8;
const RAD = Math.PI / 180;

// ---------------------------------------------------------------------------------------------
// Geohash
// ---------------------------------------------------------------------------------------------

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export interface CellBounds {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
}

/** Encodes a coordinate as a geohash of `precision` characters. */
export function geohashEncode(lat: number, lng: number, precision: number): string {
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
  let hash = "";
  let bits = 0;
  let value = 0;
  let evenBit = true;
  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        value = value * 2 + 1;
        lngMin = mid;
      } else {
        value *= 2;
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        value = value * 2 + 1;
        latMin = mid;
      } else {
        value *= 2;
        latMax = mid;
      }
    }
    evenBit = !evenBit;
    if (++bits === 5) {
      hash += BASE32[value];
      bits = 0;
      value = 0;
    }
  }
  return hash;
}

/** The latitude and longitude ranges a geohash covers. */
export function geohashBounds(hash: string): CellBounds {
  const box: CellBounds = { latMin: -90, latMax: 90, lngMin: -180, lngMax: 180 };
  let evenBit = true;
  for (const char of hash) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new TypeError(`Invalid geohash character: ${char}`);
    for (let bit = 4; bit >= 0; bit--) {
      const on = ((index >> bit) & 1) === 1;
      if (evenBit) {
        const mid = (box.lngMin + box.lngMax) / 2;
        if (on) box.lngMin = mid;
        else box.lngMax = mid;
      } else {
        const mid = (box.latMin + box.latMax) / 2;
        if (on) box.latMin = mid;
        else box.latMax = mid;
      }
      evenBit = !evenBit;
    }
  }
  return box;
}

export function geohashCenter(hash: string): LatLng {
  const box = geohashBounds(hash);
  return { lat: (box.latMin + box.latMax) / 2, lng: (box.lngMin + box.lngMax) / 2 };
}

/**
 * The cell containing the point followed by its (up to) eight neighbours, row by row from the
 * north-west. Longitude wraps at the antimeridian; rows beyond a pole are left out.
 */
export function cellWithNeighbours(lat: number, lng: number, precision: number): string[] {
  const own = geohashEncode(lat, lng, precision);
  const box = geohashBounds(own);
  const center = geohashCenter(own);
  const dLat = box.latMax - box.latMin;
  const dLng = box.lngMax - box.lngMin;
  const cells = [own];
  for (const row of [1, 0, -1]) {
    for (const col of [-1, 0, 1]) {
      if (row === 0 && col === 0) continue;
      const nLat = center.lat + row * dLat;
      if (nLat <= -90 || nLat >= 90) continue;
      let nLng = center.lng + col * dLng;
      if (nLng >= 180) nLng -= 360;
      if (nLng < -180) nLng += 360;
      const cell = geohashEncode(nLat, nLng, precision);
      if (!cells.includes(cell)) cells.push(cell);
    }
  }
  return cells;
}

/** The 32 cells one character finer than `hash`, in alphabet order. */
export function geohashChildren(hash: string): string[] {
  return [...BASE32].map((char) => hash + char);
}

export function boundsToBBox(box: CellBounds): BBox {
  return [box.lngMin, box.latMin, box.lngMax, box.latMax];
}

export function cellRing(hash: string): Ring {
  const b = geohashBounds(hash);
  return [
    [b.lngMin, b.latMin],
    [b.lngMax, b.latMin],
    [b.lngMax, b.latMax],
    [b.lngMin, b.latMax],
    [b.lngMin, b.latMin],
  ];
}

// ---------------------------------------------------------------------------------------------
// Distances and boxes
// ---------------------------------------------------------------------------------------------

/** Haversine distance in metres. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLng = (b.lng - a.lng) * RAD;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function ringBBox(ring: readonly Position[]): BBox {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLng, minLat, maxLng, maxLat];
}

export function unionBBox(boxes: readonly BBox[]): BBox | null {
  if (boxes.length === 0) return null;
  return [
    Math.min(...boxes.map((b) => b[0])),
    Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])),
    Math.max(...boxes.map((b) => b[3])),
  ];
}

export function bboxCenter(box: BBox): LatLng {
  return { lat: (box[1] + box[3]) / 2, lng: (box[0] + box[2]) / 2 };
}

export function bboxContains(box: BBox, point: LatLng): boolean {
  return point.lng >= box[0] && point.lng <= box[2] && point.lat >= box[1] &&
    point.lat <= box[3];
}

/** The smallest circle around the box's centre that covers the whole box. */
export function bboxCircle(box: BBox): { center: LatLng; radiusM: number } {
  const center = bboxCenter(box);
  const corners: LatLng[] = [
    { lng: box[0], lat: box[1] },
    { lng: box[2], lat: box[1] },
    { lng: box[2], lat: box[3] },
    { lng: box[0], lat: box[3] },
  ];
  return { center, radiusM: Math.max(...corners.map((c) => distanceMeters(center, c))) };
}

/** Metres from a point to the nearest point of a box (0 inside it). */
export function distanceToBBox(point: LatLng, box: BBox): number {
  const nearest = {
    lng: Math.min(Math.max(point.lng, box[0]), box[2]),
    lat: Math.min(Math.max(point.lat, box[1]), box[3]),
  };
  return distanceMeters(point, nearest);
}

// ---------------------------------------------------------------------------------------------
// Planar polygon work
// ---------------------------------------------------------------------------------------------

/** Projects to metres around `originLat` (x east, y north). */
export function projector(originLat: number): (p: Position) => [number, number] {
  const kx = EARTH_RADIUS_M * RAD * Math.cos(originLat * RAD);
  const ky = EARTH_RADIUS_M * RAD;
  return ([lng, lat]) => [lng * kx, lat * ky];
}

/** Signed area in square metres: positive for counter-clockwise rings. */
export function signedRingArea(ring: readonly Position[], originLat?: number): number {
  if (ring.length < 4) return 0;
  const project = projector(originLat ?? ring[0]![1]);
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = project(ring[i]!);
    const [x2, y2] = project(ring[i + 1]!);
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

export function ringPerimeter(ring: readonly Position[]): number {
  let total = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lng1, lat1] = ring[i]!;
    const [lng2, lat2] = ring[i + 1]!;
    total += distanceMeters({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 });
  }
  return total;
}

/** Outline area minus hole areas, in square metres. */
export function polygonArea(polygon: Polygon): number {
  const [outer, ...holes] = polygon;
  if (!outer) return 0;
  const origin = outer[0]![1];
  const area = Math.abs(signedRingArea(outer, origin)) -
    holes.reduce((sum, hole) => sum + Math.abs(signedRingArea(hole, origin)), 0);
  return Math.max(area, 0);
}

/** Even-odd ray casting; points on an edge may fall either way. */
export function pointInRing(point: LatLng, ring: readonly Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (
      (yi > point.lat) !== (yj > point.lat) &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

export function pointInPolygon(point: LatLng, polygon: Polygon): boolean {
  const [outer, ...holes] = polygon;
  if (!outer || !pointInRing(point, outer)) return false;
  return !holes.some((hole) => pointInRing(point, hole));
}

/** The area-weighted centroid of the outline (falls back to the box centre when degenerate). */
export function ringCentroid(ring: readonly Position[]): LatLng {
  const project = projector(ring[0]![1]);
  const origin = project(ring[0]!);
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = project(ring[i]!);
    const [x2, y2] = project(ring[i + 1]!);
    const ax = x1 - origin[0], ay = y1 - origin[1], bx = x2 - origin[0], by = y2 - origin[1];
    const cross = ax * by - bx * ay;
    a += cross;
    cx += (ax + bx) * cross;
    cy += (ay + by) * cross;
  }
  if (Math.abs(a) < 1e-9) return bboxCenter(ringBBox(ring));
  const x = cx / (3 * a) + origin[0];
  const y = cy / (3 * a) + origin[1];
  const kx = EARTH_RADIUS_M * RAD * Math.cos(ring[0]![1] * RAD);
  const ky = EARTH_RADIUS_M * RAD;
  return { lng: x / kx, lat: y / ky };
}

/** Returns the ring wound counter-clockwise (`ccw`) or clockwise. */
export function orientRing(ring: Ring, ccw: boolean): Ring {
  const isCcw = signedRingArea(ring) > 0;
  return isCcw === ccw ? ring : [...ring].reverse();
}

function perpendicularDistance(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / length;
}

/** Douglas-Peucker over an open polyline; keeps both ends. */
function simplifyLine(points: readonly [number, number][], tolerance: number): number[] {
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let index = -1;
    let max = 0;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistance(points[i]!, points[start]!, points[end]!);
      if (d > max) {
        max = d;
        index = i;
      }
    }
    if (index >= 0 && max > tolerance) {
      keep[index] = true;
      stack.push([start, index], [index, end]);
    }
  }
  return keep.flatMap((k, i) => (k ? [i] : []));
}

/**
 * Douglas-Peucker for a closed ring with a tolerance in metres. The ring is split at the point
 * farthest from its start so both halves have distinct ends. Returns null when fewer than three
 * distinct points survive.
 */
export function simplifyRing(ring: Ring, toleranceM: number): Ring | null {
  if (ring.length < 4) return null;
  const project = projector(ring[0]![1]);
  const points = ring.map(project);
  let far = 1;
  let farDistance = -1;
  for (let i = 1; i < points.length - 1; i++) {
    const d = Math.hypot(points[i]![0] - points[0]![0], points[i]![1] - points[0]![1]);
    if (d > farDistance) {
      farDistance = d;
      far = i;
    }
  }
  const first = simplifyLine(points.slice(0, far + 1), toleranceM);
  const second = simplifyLine(points.slice(far), toleranceM).map((i) => i + far);
  const indices = [...first, ...second.slice(1)];
  if (indices.length < 4) return null;
  return indices.map((i) => ring[i]!);
}

/** Rounds to 6 decimals (about 0.1 m), which keeps stored polygons small. */
export function roundPosition([lng, lat]: Position): Position {
  return [Math.round(lng * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6];
}
