/**
 * What the food map draws, worked out from one `food-map` answer: the neighbourhoods with their
 * progress and heat, the healthy-leaning spots to page through on the card, the caller's own
 * check-ins as dots, and the header stats (glow level, claims, the next claim to aim for).
 *
 * Pure, so the rules the screen shows are tested without a map.
 */
import {
  claimedCount,
  daysUntilCooler,
  distanceMeters,
  drawableCheckIns,
  glowLevel,
  heatShade,
  nextClaimTarget,
  pointInPolygon,
  regionCheckInTimes,
  regionHeat,
  regionProgress,
  type GlowLevel,
  type HeatShade,
  type LatLng,
  type RegionProgress,
} from '@/domain/foodmap';
import type { FoodMapResponse, FoodRegion, PlacePhotoRef } from '@/lib/api/foodMap';

/** How a region is drawn: claimed, started (some spots visited), open, or with no spots to aim for. */
export type RegionState = 'claimed' | 'started' | 'open' | 'empty';

export interface MapPoint {
  readonly latitude: number;
  readonly longitude: number;
}

export interface RegionView {
  readonly id: string;
  readonly name: string;
  /** The outer boundary. */
  readonly outline: readonly MapPoint[];
  readonly holes: readonly (readonly MapPoint[])[];
  /** Where the name and progress are written. */
  readonly labelAt: MapPoint;
  readonly progress: RegionProgress;
  readonly state: RegionState;
  readonly shade: HeatShade;
  /** Days until the region's shade drops a step; `null` when it is not warm at all. */
  readonly coolsInDays: number | null;
  /** "2 of 5", "Claimed", or `null` when the region has no spots yet. */
  readonly label: string | null;
}

export interface SpotView {
  readonly placeId: string;
  readonly name: string;
  readonly point: MapPoint;
  /** "Vietnamese", "Salad shop"; `null` when Google gave no type. */
  readonly kind: string | null;
  readonly regionId: string;
  readonly regionName: string;
  readonly regionProgress: RegionProgress;
  readonly visits: number;
  readonly photos: readonly PlacePhotoRef[];
  /** From the device position; `null` when it is not known. */
  readonly distanceM: number | null;
}

export interface CheckInDot {
  readonly placeId: string;
  readonly point: MapPoint;
  readonly visits: number;
}

export interface ClaimTargetView {
  readonly regionName: string;
  readonly remaining: number;
  readonly placeId: string;
}

export interface FoodMapView {
  readonly regions: readonly RegionView[];
  readonly spots: readonly SpotView[];
  readonly dots: readonly CheckInDot[];
  readonly glow: GlowLevel;
  readonly totals: FoodMapResponse['totals'];
  /** Claimed regions on this map, out of `regions.length`. */
  readonly claimedHere: number;
  readonly target: ClaimTargetView | null;
  /** Some regions' spots are still being looked up: the card list will grow. */
  readonly spotsPending: boolean;
  /** Places is not set up or held back, so there are no spots to suggest. */
  readonly spotsUnavailable: boolean;
}

const toPoint = ([lng, lat]: readonly [number, number]): MapPoint => ({
  latitude: lat,
  longitude: lng,
});

/** The bbox centre when it is inside the region, else the mean of the outer ring's corners. */
function labelPoint(region: FoodRegion): MapPoint {
  const [west, south, east, north] = region.bbox;
  const centre: [number, number] = [(west + east) / 2, (south + north) / 2];
  if (pointInPolygon(centre, region.polygon)) return toPoint(centre);
  const outer = region.polygon[0] ?? [];
  // A closed ring repeats its first corner last; leave that one out of the mean.
  const corners = outer.slice(0, -1);
  if (corners.length === 0) return toPoint(centre);
  let lng = 0;
  let lat = 0;
  for (const [x, y] of corners) {
    lng += x;
    lat += y;
  }
  return { latitude: lat / corners.length, longitude: lng / corners.length };
}

function bboxArea(region: FoodRegion): number {
  const [west, south, east, north] = region.bbox;
  return Math.abs((east - west) * (north - south));
}

function regionState(progress: RegionProgress): RegionState {
  if (progress.claimed) return 'claimed';
  if (progress.total === 0) return 'empty';
  return progress.done > 0 ? 'started' : 'open';
}

function regionLabel(progress: RegionProgress): string | null {
  if (progress.claimed) return 'Claimed';
  if (progress.total === 0) return null;
  return `${progress.done} of ${progress.total}`;
}

const TYPE_SUFFIX = /_restaurant$/;

/** A Google place type as a short label: `vietnamese_restaurant` → "Vietnamese". */
export function placeKindLabel(primaryType: string | null): string | null {
  if (primaryType === null) return null;
  const words = primaryType.replace(TYPE_SUFFIX, '').replace(/_/g, ' ').trim();
  if (words.length === 0) return null;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface BuildFoodMapInput {
  readonly response: FoodMapResponse;
  /** The device position the map was asked for; `null` keeps distances unknown. */
  readonly origin: LatLng | null;
  readonly now: Date;
}

export function buildFoodMapView({ response, origin, now }: BuildFoodMapInput): FoodMapView {
  const regions: RegionView[] = response.regions.map((region) => {
    const progress = regionProgress(region.progress);
    const times = regionCheckInTimes(response.checkIns, region.id);
    const [outer = [], ...holes] = region.polygon;
    return {
      id: region.id,
      name: region.name,
      outline: outer.map(toPoint),
      holes: holes.map((ring) => ring.map(toPoint)),
      labelAt: labelPoint(region),
      progress,
      state: regionState(progress),
      shade: heatShade(regionHeat(times, now)),
      coolsInDays: daysUntilCooler(times, now),
      label: regionLabel(progress),
    };
  });
  const progressById = new Map(regions.map((r) => [r.id, r.progress]));

  // A place can be a spot of a neighbourhood and of a larger region around it; it is shown once,
  // under the smaller of the two.
  const spotById = new Map<string, { spot: SpotView; area: number }>();
  for (const region of response.regions) {
    if (region.spotsStatus !== 'ready') continue;
    const area = bboxArea(region);
    for (const spot of region.spots) {
      const known = spotById.get(spot.placeId);
      if (known && known.area <= area) continue;
      const point = { lat: spot.lat, lng: spot.lng };
      spotById.set(spot.placeId, {
        area,
        spot: {
          placeId: spot.placeId,
          name: spot.name,
          point: { latitude: spot.lat, longitude: spot.lng },
          kind: placeKindLabel(spot.primaryType),
          regionId: region.id,
          regionName: region.name,
          regionProgress: progressById.get(region.id) ?? regionProgress(region.progress),
          visits: spot.visits,
          photos: spot.photos,
          distanceM: origin ? distanceMeters(origin, point) : null,
        },
      });
    }
  }
  const spots = [...spotById.values()]
    .map((entry) => entry.spot)
    .sort(
      (a, b) =>
        (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity) ||
        a.name.localeCompare(b.name) ||
        a.placeId.localeCompare(b.placeId),
    );

  const dots = drawableCheckIns(response.checkIns).map((checkIn) => ({
    placeId: checkIn.placeId,
    point: { latitude: checkIn.lat, longitude: checkIn.lng },
    visits: checkIn.visits,
  }));

  const target = nextClaimTarget(response.regions);

  return {
    regions,
    spots,
    dots,
    glow: glowLevel(response.totals.checkIns),
    totals: response.totals,
    claimedHere: claimedCount(response.regions),
    target: target
      ? {
          regionName: target.region.name,
          remaining: target.remaining,
          placeId: target.spot.placeId,
        }
      : null,
    spotsPending: response.regions.some((r) => r.spotsStatus === 'pending'),
    spotsUnavailable:
      !response.configured || response.regions.every((r) => r.spotsStatus === 'unavailable'),
  };
}

/** Fill opacity of a region: a claim is solid, progress and recent visits tint the rest. */
export function regionFillOpacity(
  region: Pick<RegionView, 'state' | 'progress' | 'shade'>,
): number {
  if (region.state === 'claimed') return 0.38;
  const fromProgress = region.state === 'started' ? 0.04 + 0.1 * region.progress.fraction : 0;
  const fromHeat = region.shade * 0.05;
  return Math.min(0.3, fromProgress + fromHeat);
}

export type BadgeIcon = 'flag' | 'leaf' | 'location' | 'trophy';

export interface Badge {
  readonly key: string;
  readonly title: string;
  readonly detail: string;
  readonly earned: boolean;
  readonly icon: BadgeIcon;
}

const CLAIMS_FOR_BADGE = 3;
const PLACES_FOR_BADGE = 10;

/** Achievements earned from the caller's totals; every count is the server's. */
export function badgesFor(
  totals: FoodMapResponse['totals'],
  firstClaim: { regionName: string; at: string } | null,
  formatDay: (iso: string) => string,
): Badge[] {
  return [
    {
      key: 'first-check-in',
      title: 'First check-in',
      detail: totals.checkIns > 0 ? `${totals.checkIns} so far` : 'Check in at a spot',
      earned: totals.checkIns > 0,
      icon: 'location',
    },
    {
      key: 'first-claim',
      title: 'First claim',
      detail: firstClaim
        ? `${firstClaim.regionName}, ${formatDay(firstClaim.at)}`
        : totals.claimed > 0
          ? 'Earned'
          : 'Visit every spot in an area',
      earned: totals.claimed > 0,
      icon: 'flag',
    },
    {
      key: 'ten-places',
      title: 'Ten places',
      detail: `${Math.min(totals.places, PLACES_FOR_BADGE)} of ${PLACES_FOR_BADGE}`,
      earned: totals.places >= PLACES_FOR_BADGE,
      icon: 'leaf',
    },
    {
      key: 'three-claims',
      title: 'Claim 3 regions',
      detail: `${Math.min(totals.claimed, CLAIMS_FOR_BADGE)} of ${CLAIMS_FOR_BADGE}`,
      earned: totals.claimed >= CLAIMS_FOR_BADGE,
      icon: 'trophy',
    },
  ];
}

/**
 * The caller's first claim, for the "First claim" badge: the earliest claim on this map, but only
 * when every claim they have is on it, so an older claim elsewhere is never passed over.
 */
export function firstClaim(
  view: Pick<FoodMapView, 'regions' | 'claimedHere' | 'totals'>,
): { regionName: string; at: string } | null {
  if (view.totals.claimed === 0 || view.claimedHere < view.totals.claimed) return null;
  return earliestClaim(view.regions);
}

function earliestClaim(
  regions: readonly Pick<RegionView, 'name' | 'progress'>[],
): { regionName: string; at: string } | null {
  let first: { regionName: string; at: string; ms: number } | null = null;
  for (const region of regions) {
    const at = region.progress.claimedAt;
    if (!region.progress.claimed || at === null) continue;
    const ms = Date.parse(at);
    if (!Number.isFinite(ms)) continue;
    if (first === null || ms < first.ms) first = { regionName: region.name, at, ms };
  }
  return first ? { regionName: first.regionName, at: first.at } : null;
}
