/**
 * Coordinates, distances and the location bucket used to cache searches.
 *
 * A bucket is a ~1 km grid cell. Searches are cached per (dish, bucket) so walking down the street
 * reuses the last answer instead of spending another search, and distances are recomputed on the
 * device from the person's current position.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Grid size in degrees of latitude (~1.1 km). */
const BUCKET_DEGREES = 0.01;
const EARTH_RADIUS_M = 6_371_000;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export function isValidLatLng(point: LatLng): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}

/** Great-circle distance in metres. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Stable id of the grid cell containing a point, e.g. `"4071:-7401"`. Longitude cells widen with
 * latitude so a cell stays roughly square away from the equator.
 */
export function locationBucket(point: LatLng): string {
  const latIndex = Math.floor(point.latitude / BUCKET_DEGREES);
  const lngStep = BUCKET_DEGREES / Math.max(0.2, Math.cos(toRadians(point.latitude)));
  const lngIndex = Math.floor(point.longitude / lngStep);
  return `${latIndex}:${lngIndex}`;
}

/** Metres or kilometres, or miles and feet for locales that use them. */
export type DistanceUnit = 'metric' | 'imperial';

const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM', 'GB']);

/** Picks the distance unit for a BCP-47 tag's region (`en-US` → imperial). */
export function distanceUnitFor(locale: string): DistanceUnit {
  const region = locale.split(/[-_]/)[1]?.toUpperCase();
  return region && IMPERIAL_REGIONS.has(region) ? 'imperial' : 'metric';
}

/** Short, human distance: "350 m", "1.2 km", "0.3 mi", "12 mi". */
export function formatDistance(meters: number, unit: DistanceUnit): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  if (unit === 'imperial') {
    const miles = meters / 1609.344;
    if (miles < 0.1) return `${Math.max(50, Math.round((meters * 3.28084) / 50) * 50)} ft`;
    return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
  }
  if (meters < 1000) return `${Math.max(50, Math.round(meters / 50) * 50)} m`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export interface MapRegion extends LatLng {
  latitudeDelta: number;
  longitudeDelta: number;
}

/** A region that frames the origin and every point, with a little padding. */
export function regionFor(origin: LatLng, points: readonly LatLng[]): MapRegion {
  let minLat = origin.latitude;
  let maxLat = origin.latitude;
  let minLng = origin.longitude;
  let maxLng = origin.longitude;
  for (const p of points) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLng = Math.min(minLng, p.longitude);
    maxLng = Math.max(maxLng, p.longitude);
  }
  const minDelta = 0.02;
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(minDelta, (maxLat - minLat) * 1.5),
    longitudeDelta: Math.max(minDelta, (maxLng - minLng) * 1.5),
  };
}
