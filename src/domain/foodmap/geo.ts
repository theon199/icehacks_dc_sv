/**
 * Geometry for the food map: distances, placing a point in a region, and the check-in distance rule.
 * Positions on a polygon are GeoJSON-style `[lng, lat]`; standalone points are `{ lat, lng }`.
 */
import {
  CHECK_IN_MAX_ACCURACY_BONUS_M,
  CHECK_IN_MAX_REPORTED_ACCURACY_M,
  CHECK_IN_RADIUS_M,
} from './constants';

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

/** `[lng, lat]`. */
export type Position = readonly [number, number];

/** A polygon's rings: the first is the outer boundary, the rest are holes. */
export type PolygonRings = readonly (readonly Position[])[];

/** Mean Earth radius used for haversine distances. */
export const EARTH_RADIUS_M = 6_371_008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in metres (haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Whether `[lng, lat]` lies inside the polygon, by the even-odd rule over every ring, so a point in
 * a hole is outside. Rings may be closed (first position repeated last) or open. Coordinates are
 * treated as planar, which is accurate at neighbourhood scale; a point exactly on an edge may land
 * on either side.
 */
export function pointInPolygon(point: Position, rings: PolygonRings): boolean {
  const [x, y] = point;
  let inside = false;
  for (const ring of rings) {
    const n = ring.length;
    if (n < 3) continue;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const pi = ring[i];
      const pj = ring[j];
      if (!pi || !pj) continue;
      const [xi, yi] = pi;
      const [xj, yj] = pj;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

export interface CheckInAllowance {
  /** Whether the server would accept a check-in from this distance. */
  readonly allowed: boolean;
  /** The distance the server allows for this accuracy, in metres. */
  readonly allowedM: number;
}

/**
 * The server's distance rule: allowed within `CHECK_IN_RADIUS_M` plus the GPS accuracy, the
 * accuracy capped at `CHECK_IN_MAX_ACCURACY_BONUS_M`. An unknown or negative accuracy adds nothing;
 * an accuracy the server would refuse (above `CHECK_IN_MAX_REPORTED_ACCURACY_M`) or an unknown
 * distance is never allowed.
 */
export function checkInAllowance(distanceM: number, accuracyM: number | null): CheckInAllowance {
  const accuracy = accuracyM != null && Number.isFinite(accuracyM) ? Math.max(0, accuracyM) : 0;
  const allowedM = CHECK_IN_RADIUS_M + Math.min(accuracy, CHECK_IN_MAX_ACCURACY_BONUS_M);
  const accepted = accuracyM == null || !(accuracyM > CHECK_IN_MAX_REPORTED_ACCURACY_M);
  const allowed = accepted && Number.isFinite(distanceM) && distanceM <= allowedM;
  return { allowed, allowedM };
}
