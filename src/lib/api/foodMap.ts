/**
 * Typed wrappers for the food map edge functions: `food-map` (regions, spots and the caller's
 * check-ins around a point), `food-check-in` and `place-photo`. Requests are checked before sending
 * and every response is parsed with zod by `callFunction`, snake_case in and camelCase out.
 *
 * Failures arrive as `ApiError`s from the shared client. `checkInRejection` reads the check-in
 * refusals a screen explains ("You're 340 m away", "You can check in again at 7:40 pm"); the photo
 * helpers recognise a missing Places key and the daily photo quota.
 */
import { z } from 'zod';

import {
  CHECK_IN_MAX_REPORTED_ACCURACY_M,
  PHOTOS_PER_SPOT_MAX,
  SPOTS_PER_REGION_MAX,
} from '@/domain/foodmap';

import { type CallOptions, callFunction } from './client';
import { type ApiError, isApiError } from './errors';

const FOOD_MAP = 'food-map';
const FOOD_CHECK_IN = 'food-check-in';
const PLACE_PHOTO = 'place-photo';

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);
/** A whole number of things: never negative. */
const tally = z.number().int().gte(0);
const isoTime = z.iso.datetime({ offset: true });
const placeId = z.string().min(1).max(300);
/** `[lng, lat]`. */
const position = z.tuple([longitude, latitude]);
/** A closed ring: at least a triangle, with the first position repeated last. */
const ring = z
  .array(position)
  .min(4)
  .refine((points) => {
    const first = points[0];
    const last = points.at(-1);
    return (
      first !== undefined && last !== undefined && first[0] === last[0] && first[1] === last[1]
    );
  }, 'Ring is not closed');

/** An https link, or `null` for anything else so one odd attribution link cannot sink the map. */
const httpsLinkOrNull = z
  .string()
  .nullable()
  .transform((uri) => (uri !== null && /^https:\/\/[^\s]+$/i.test(uri) ? uri : null));

// -------------------------------------------------------------------------------------------------
// food-map
// -------------------------------------------------------------------------------------------------

export const foodMapRequestSchema = z.object({ lat: latitude, lng: longitude });
export type FoodMapRequest = z.input<typeof foodMapRequestSchema>;

export const placePhotoRefSchema = z
  .object({
    name: z.string().min(1).max(500),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    attributions: z.array(z.object({ display_name: z.string(), uri: httpsLinkOrNull })),
  })
  .transform((p) => ({
    name: p.name,
    width: p.width,
    height: p.height,
    attributions: p.attributions.map((a) => ({ displayName: a.display_name, uri: a.uri })),
  }));
export type PlacePhotoRef = z.output<typeof placePhotoRefSchema>;

export const foodSpotSchema = z
  .object({
    place_id: placeId,
    name: z.string(),
    lat: latitude,
    lng: longitude,
    primary_type: z.string().nullable(),
    rank: z.number().int().min(1).max(SPOTS_PER_REGION_MAX),
    visits: tally,
    photos: z.array(placePhotoRefSchema).max(PHOTOS_PER_SPOT_MAX),
  })
  .transform((s) => ({
    placeId: s.place_id,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    primaryType: s.primary_type,
    rank: s.rank,
    visits: s.visits,
    photos: s.photos,
  }));
export type FoodSpot = z.output<typeof foodSpotSchema>;

/**
 * `ready`: the spot list is fetched (it may be empty). `pending`: not fetched yet; a later view
 * fills it. `unavailable`: Places is not set up, or its budget held the fill back.
 */
export const spotsStatusSchema = z.enum(['ready', 'pending', 'unavailable']);
export type SpotsStatus = z.infer<typeof spotsStatusSchema>;

export const foodRegionSchema = z
  .object({
    id: z.uuid(),
    source: z.enum(['osm', 'grid']),
    name: z.string(),
    /** Rings, each closed; the first is the outer boundary, the rest are holes. */
    polygon: z.array(ring).min(1),
    bbox: z.tuple([longitude, latitude, longitude, latitude]),
    progress: z.object({
      done: tally,
      total: tally.max(SPOTS_PER_REGION_MAX),
      claimed: z.boolean(),
      claimed_at: isoTime.nullable(),
    }),
    spots_status: spotsStatusSchema,
    spots: z.array(foodSpotSchema).max(SPOTS_PER_REGION_MAX),
  })
  .transform((r) => ({
    id: r.id,
    source: r.source,
    name: r.name,
    polygon: r.polygon,
    bbox: r.bbox,
    progress: {
      done: r.progress.done,
      total: r.progress.total,
      claimed: r.progress.claimed,
      claimedAt: r.progress.claimed_at,
    },
    spotsStatus: r.spots_status,
    spots: r.spots,
  }));
export type FoodRegion = z.output<typeof foodRegionSchema>;

export const foodCheckInSummarySchema = z
  .object({
    place_id: placeId,
    /** Name and position are `null` together once Google's 30-day content limit drops them. */
    place_name: z.string().nullable(),
    lat: latitude.nullable(),
    lng: longitude.nullable(),
    region_id: z.uuid().nullable(),
    healthy: z.boolean(),
    visits: tally,
    /** Most recent first, at most 20. */
    times: z.array(isoTime).max(20),
  })
  .refine(
    (c) => (c.place_name === null) === (c.lat === null) && (c.lat === null) === (c.lng === null),
    'Place name and position must be present or absent together',
  )
  .transform((c) => ({
    placeId: c.place_id,
    placeName: c.place_name,
    lat: c.lat,
    lng: c.lng,
    regionId: c.region_id,
    healthy: c.healthy,
    visits: c.visits,
    times: c.times,
  }));
export type FoodCheckInSummary = z.output<typeof foodCheckInSummarySchema>;

export const foodMapResponseSchema = z
  .object({
    /** `false` when Places is not set up: regions may still come back, with no spots. */
    configured: z.boolean(),
    notice: z.enum(['budget']).nullable(),
    attribution: z.object({ osm: z.boolean(), google: z.boolean() }),
    regions: z.array(foodRegionSchema),
    check_ins: z.array(foodCheckInSummarySchema),
    /** Across all the caller's data, not only this area. */
    totals: z.object({ check_ins: tally, places: tally, claimed: tally }),
  })
  .transform((r) => ({
    configured: r.configured,
    notice: r.notice,
    attribution: r.attribution,
    regions: r.regions,
    checkIns: r.check_ins,
    totals: { checkIns: r.totals.check_ins, places: r.totals.places, claimed: r.totals.claimed },
  }));
export type FoodMapResponse = z.output<typeof foodMapResponseSchema>;

/** Regions around a point with the caller's progress, spots and check-ins. */
export function fetchFoodMap(
  request: FoodMapRequest,
  options?: CallOptions,
): Promise<FoodMapResponse> {
  return callFunction(
    FOOD_MAP,
    foodMapRequestSchema.parse(request),
    foodMapResponseSchema,
    options,
  );
}

const AREA_FILL_RETRY_DEFAULT_S = 5;

const areaFillDetailsSchema = z.object({ reason: z.literal('area_fill_in_progress') });

/**
 * When a failed `fetchFoodMap` only means the caller's area is still being filled the first time,
 * how long to wait before asking again: the `Retry-After` header, else 5 seconds. `null` for any
 * other failure.
 */
export function foodMapPending(error: unknown): { readonly retryAfterS: number } | null {
  if (!isApiError(error) || error.functionName !== FOOD_MAP) return null;
  if (error.code !== 'upstream_unavailable') return null;
  if (!areaFillDetailsSchema.safeParse(error.details).success) return null;
  const header = error.retryAfterSeconds;
  return { retryAfterS: header !== undefined && header > 0 ? header : AREA_FILL_RETRY_DEFAULT_S };
}

// -------------------------------------------------------------------------------------------------
// food-check-in
// -------------------------------------------------------------------------------------------------

export const checkInRequestSchema = z.object({
  placeId,
  /** Device position, used only for the server's distance check; never stored. */
  lat: latitude,
  lng: longitude,
  accuracyM: z.number().min(0).max(CHECK_IN_MAX_REPORTED_ACCURACY_M),
});
export type CheckInRequest = z.input<typeof checkInRequestSchema>;

export const checkInResponseSchema = z
  .object({
    visits_here: z.number().int().gte(1),
    total_check_ins: z.number().int().gte(1),
    healthy: z.boolean(),
    region: z
      .object({
        id: z.uuid(),
        name: z.string(),
        done: tally,
        total: tally.max(SPOTS_PER_REGION_MAX),
        claimed: z.boolean(),
      })
      .nullable(),
    claimed_now: z.boolean(),
    /** Every region this check-in completed, possibly a larger one around `region`. */
    claimed_regions: z.array(z.object({ id: z.uuid(), name: z.string() })),
  })
  .transform((r) => ({
    visitsHere: r.visits_here,
    totalCheckIns: r.total_check_ins,
    healthy: r.healthy,
    region: r.region,
    claimedNow: r.claimed_now,
    claimedRegions: r.claimed_regions,
  }));
export type CheckInResponse = z.output<typeof checkInResponseSchema>;

/** Checks in at a place from the device's current position. */
export function checkInAtPlace(
  request: CheckInRequest,
  options?: CallOptions,
): Promise<CheckInResponse> {
  const r = checkInRequestSchema.parse(request);
  return callFunction(
    FOOD_CHECK_IN,
    { place_id: r.placeId, lat: r.lat, lng: r.lng, accuracy_m: r.accuracyM },
    checkInResponseSchema,
    options,
  );
}

const tooFarDetailsSchema = z.object({
  distance_m: z.number().nonnegative(),
  allowed_m: z.number().nonnegative(),
});

const rateLimitedDetailsSchema = z.object({
  retry_at: isoTime,
  reason: z.enum(['cooldown', 'daily']),
});

/** Why the server refused a check-in, in a form a screen can explain. */
export type CheckInRejection =
  /** Too far from the place: "You're 340 m away". */
  | { readonly reason: 'too_far'; readonly distanceM: number; readonly allowedM: number }
  /**
   * Checked in here within the cooldown, or used up the daily check-ins: "You can check in again
   * at 7:40 pm". `retryAt` is an ISO time.
   */
  | {
      readonly reason: 'rate_limited';
      readonly limit: 'cooldown' | 'daily';
      readonly retryAt: string;
    }
  /** The place is unknown or its position cannot be resolved. */
  | { readonly reason: 'not_found' };

/**
 * The refusal behind a failed `checkInAtPlace`, or `null` for any other failure (including a
 * refusal whose details do not parse); show `error.userMessage` then.
 */
export function checkInRejection(error: unknown): CheckInRejection | null {
  if (!isApiError(error) || error.functionName !== FOOD_CHECK_IN) return null;
  switch (error.code) {
    case 'too_far': {
      const details = tooFarDetailsSchema.safeParse(error.details);
      return details.success
        ? {
            reason: 'too_far',
            distanceM: details.data.distance_m,
            allowedM: details.data.allowed_m,
          }
        : null;
    }
    case 'rate_limited': {
      const details = rateLimitedDetailsSchema.safeParse(error.details);
      return details.success
        ? { reason: 'rate_limited', limit: details.data.reason, retryAt: details.data.retry_at }
        : null;
    }
    case 'not_found':
      return { reason: 'not_found' };
    default:
      return null;
  }
}

// -------------------------------------------------------------------------------------------------
// place-photo
// -------------------------------------------------------------------------------------------------

export const placePhotoRequestSchema = z.object({
  /** `places/<id>/photos/<ref>`, from a spot's `photos[].name`. */
  photoName: z.string().regex(/^places\/[^/\s]+\/photos\/[^/\s]+$/),
  maxWidth: z.number().int().min(200).max(1600),
});
export type PlacePhotoRequest = z.input<typeof placePhotoRequestSchema>;

export const placePhotoResponseSchema = z
  .object({ url: z.url({ protocol: /^https$/ }), expires_at: isoTime })
  .transform((r) => ({ url: r.url, expiresAt: r.expires_at }));
export type PlacePhotoResponse = z.output<typeof placePhotoResponseSchema>;

/** A short-lived image URL for a place photo; keep it in memory only. */
export function fetchPlacePhoto(
  request: PlacePhotoRequest,
  options?: CallOptions,
): Promise<PlacePhotoResponse> {
  const r = placePhotoRequestSchema.parse(request);
  return callFunction(
    PLACE_PHOTO,
    { photo_name: r.photoName, max_width: r.maxWidth },
    placePhotoResponseSchema,
    options,
  );
}

function photoErrorWithCode(error: unknown, code: string): error is ApiError {
  return isApiError(error) && error.functionName === PLACE_PHOTO && error.code === code;
}

/** Places is not set up on the server, so no photos can load; show the card without one. */
export function isPlacePhotoUnavailable(error: unknown): error is ApiError {
  return photoErrorWithCode(error, 'upstream_unavailable');
}

/** The caller's daily photo allowance is used up; `retryAfterSeconds` says when, if sent. */
export function isPlacePhotoQuotaExceeded(error: unknown): error is ApiError {
  return photoErrorWithCode(error, 'quota_exceeded');
}
