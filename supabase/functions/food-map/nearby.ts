/**
 * A region's target spots from Google Places API (New) Nearby Search, and the pure rule that
 * picks them.
 *
 * Cost: the field mask below is billed as Nearby Search Enterprise, because the ranking needs
 * `rating` and `userRatingCount`. Every other field (`id`, `displayName`, `location`,
 * `primaryType`, `types`, `photos`) is in the Pro tier. One search runs per region per 30 days.
 */

import { z } from "zod";
import { HttpError } from "../_shared/http.ts";
import { type BBox, bboxCircle, type LatLng, pointInPolygon, type Polygon } from "./geo.ts";
import { EXCLUDED_TYPES, HEALTHY_TYPES, isHealthyLeaning } from "./healthy.ts";

export const NEARBY_SEARCH_URL = "https://places.googleapis.com/v1/places:searchNearby";

export const NEARBY_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.primaryType",
  "places.types",
  "places.photos",
  "places.rating",
  "places.userRatingCount",
].join(",");

export const SPOTS_PER_REGION_MAX = 5;
export const PHOTOS_PER_SPOT_MAX = 3;
const MAX_RESULTS = 20;
const MIN_RADIUS_M = 50;
const MAX_RADIUS_M = 50_000;
const TIMEOUT_MS = 10_000;

export interface PhotoAttribution {
  display_name: string;
  uri: string | null;
}

export interface SpotPhoto {
  name: string;
  width: number;
  height: number;
  attributions: PhotoAttribution[];
}

export interface NearbyPlace {
  place_id: string;
  name: string;
  lat: number;
  lng: number;
  primary_type: string | null;
  types: string[];
  rating: number | null;
  rating_count: number | null;
  photos: SpotPhoto[];
}

export interface Spot {
  place_id: string;
  name: string;
  lat: number;
  lng: number;
  primary_type: string | null;
  rank: number;
  photos: SpotPhoto[];
}

/** A Places photo resource name, as returned by the API and accepted by place-photo. */
export const PHOTO_NAME_PATTERN = /^places\/[A-Za-z0-9_-]{1,300}\/photos\/[A-Za-z0-9_-]{1,1000}$/;

const photoSchema = z.looseObject({
  name: z.string().regex(PHOTO_NAME_PATTERN),
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  authorAttributions: z.array(z.looseObject({
    displayName: z.string().optional(),
    uri: z.string().optional(),
  })).optional(),
});

const apiPlaceSchema = z.looseObject({
  id: z.string().min(1).max(300),
  displayName: z.looseObject({ text: z.string() }).optional(),
  location: z.looseObject({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  primaryType: z.string().max(60).optional(),
  types: z.array(z.string()).optional(),
  rating: z.number().min(0).max(5).optional(),
  userRatingCount: z.number().int().nonnegative().optional(),
  photos: z.array(z.unknown()).optional(),
});

const apiResponseSchema = z.looseObject({ places: z.array(z.unknown()).optional() });

function toPhoto(raw: unknown): SpotPhoto | null {
  const parsed = photoSchema.safeParse(raw);
  if (!parsed.success) return null;
  const attributions = (parsed.data.authorAttributions ?? []).flatMap((a) => {
    const name = a.displayName?.trim();
    return name ? [{ display_name: name.slice(0, 200), uri: a.uri?.slice(0, 500) || null }] : [];
  });
  return {
    name: parsed.data.name,
    width: parsed.data.widthPx,
    height: parsed.data.heightPx,
    attributions: attributions.slice(0, 5),
  };
}

/** Normalises one API place, or null when it lacks an id, name or location. */
export function toNearbyPlace(raw: unknown): NearbyPlace | null {
  const parsed = apiPlaceSchema.safeParse(raw);
  if (!parsed.success) return null;
  const p = parsed.data;
  const name = p.displayName?.text.trim();
  if (!name) return null;
  const photos = (p.photos ?? []).flatMap((photo) => {
    const parsedPhoto = toPhoto(photo);
    return parsedPhoto ? [parsedPhoto] : [];
  });
  return {
    place_id: p.id,
    name: name.slice(0, 200),
    lat: p.location.latitude,
    lng: p.location.longitude,
    primary_type: p.primaryType || null,
    types: (p.types ?? []).slice(0, 40),
    rating: p.rating ?? null,
    rating_count: p.userRatingCount ?? null,
    photos: photos.slice(0, PHOTOS_PER_SPOT_MAX),
  };
}

/** rating × ln(1 + ratings), so a place with no ratings scores 0 instead of failing. */
export function spotScore(place: Pick<NearbyPlace, "rating" | "rating_count">): number {
  return (place.rating ?? 0) * Math.log1p(place.rating_count ?? 0);
}

/**
 * The region's spots: healthy-leaning places whose point is inside the region's polygon, best
 * score first (ties: more ratings, then place id), at most five, ranked 1..n.
 */
export function chooseSpots(places: readonly NearbyPlace[], polygon: Polygon): Spot[] {
  const seen = new Set<string>();
  return places
    .filter((p) => {
      if (seen.has(p.place_id)) return false;
      seen.add(p.place_id);
      return isHealthyLeaning(p.primary_type, p.types) &&
        pointInPolygon({ lat: p.lat, lng: p.lng }, polygon);
    })
    .sort((a, b) =>
      spotScore(b) - spotScore(a) ||
      (b.rating_count ?? 0) - (a.rating_count ?? 0) ||
      (a.place_id < b.place_id ? -1 : a.place_id > b.place_id ? 1 : 0)
    )
    .slice(0, SPOTS_PER_REGION_MAX)
    .map((p, index) => ({
      place_id: p.place_id,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      primary_type: p.primary_type,
      rank: index + 1,
      photos: p.photos,
    }));
}

/** The circle searched for a region: its bounding box's covering circle. */
export function searchCircle(box: BBox): { center: LatLng; radiusM: number } {
  const { center, radiusM } = bboxCircle(box);
  return {
    center,
    radiusM: Math.min(Math.max(Math.ceil(radiusM), MIN_RADIUS_M), MAX_RADIUS_M),
  };
}

export interface NearbyRequest {
  box: BBox;
  apiKey: string;
  fetch?: typeof fetch;
}

function unavailable(message: string, retryAfter?: string | null): HttpError {
  return new HttpError("upstream_unavailable", message, {
    headers: retryAfter ? { "Retry-After": retryAfter } : {},
    details: { reason: "places_unavailable" },
  });
}

/**
 * One Nearby Search restricted to the region's circle and to healthy-leaning types. Failures
 * become HttpErrors: 401/403 → misconfigured, 429/5xx/network → 503, timeout → 504, else 502.
 */
export async function searchNearby(req: NearbyRequest): Promise<NearbyPlace[]> {
  const doFetch = req.fetch ?? fetch;
  const circle = searchCircle(req.box);
  let res: Response;
  try {
    res = await doFetch(NEARBY_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": req.apiKey,
        "X-Goog-FieldMask": NEARBY_FIELD_MASK,
      },
      body: JSON.stringify({
        includedTypes: HEALTHY_TYPES,
        excludedTypes: EXCLUDED_TYPES,
        maxResultCount: MAX_RESULTS,
        rankPreference: "POPULARITY",
        languageCode: "en",
        locationRestriction: {
          circle: {
            center: { latitude: circle.center.lat, longitude: circle.center.lng },
            radius: circle.radiusM,
          },
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new HttpError("upstream_timeout", "Nearby search took too long. Try again.");
    }
    console.error("nearby search request failed", error instanceof Error ? error.name : "unknown");
    throw unavailable("Nearby search could not be reached. Try again shortly.");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("nearby search api error", { status: res.status, body: text.slice(0, 300) });
    if (res.status === 401 || res.status === 403) {
      throw new HttpError("misconfigured", "Nearby search is not configured correctly.");
    }
    if (res.status === 429 || res.status >= 500) {
      throw unavailable(
        "Nearby search is busy. Try again shortly.",
        res.headers.get("retry-after"),
      );
    }
    throw new HttpError("upstream_error", "Nearby search could not answer that request.");
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new HttpError("upstream_error", "Nearby search returned an unreadable response.");
  }
  const parsed = apiResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError("upstream_error", "Nearby search returned an unexpected response.");
  }
  return (parsed.data.places ?? []).flatMap((raw) => {
    const place = toNearbyPlace(raw);
    return place ? [place] : [];
  });
}
