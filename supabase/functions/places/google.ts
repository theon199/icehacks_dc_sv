/** Google Places API (New) Text Search, with a minimal field mask. */

import { z } from "zod";
import { HttpError } from "../_shared/http.ts";
import type { Place } from "./rank.ts";

export const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

/** Only the fields Famara shows; every extra field can move a request into a pricier tier. */
export const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.currentOpeningHours.openNow",
  "places.formattedAddress",
  "places.primaryType",
].join(",");

export const MAX_RESULTS = 10;
const TIMEOUT_MS = 10_000;

const PRICE_LEVELS: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

const apiPlaceSchema = z.looseObject({
  id: z.string().min(1).max(300),
  displayName: z.looseObject({ text: z.string() }).optional(),
  location: z.looseObject({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  rating: z.number().min(0).max(5).optional(),
  userRatingCount: z.number().int().nonnegative().optional(),
  priceLevel: z.string().optional(),
  currentOpeningHours: z.looseObject({ openNow: z.boolean().optional() }).optional(),
  formattedAddress: z.string().optional(),
  primaryType: z.string().optional(),
});

const apiResponseSchema = z.looseObject({ places: z.array(z.unknown()).optional() });

/** Normalises one API place, or null when it lacks an id, name or location. */
export function toPlace(raw: unknown): Place | null {
  const parsed = apiPlaceSchema.safeParse(raw);
  if (!parsed.success) return null;
  const p = parsed.data;
  const name = p.displayName?.text.trim();
  if (!name) return null;
  return {
    id: p.id,
    name: name.slice(0, 200),
    address: p.formattedAddress?.slice(0, 300) ?? null,
    lat: p.location.latitude,
    lng: p.location.longitude,
    rating: p.rating ?? null,
    rating_count: p.userRatingCount ?? null,
    price_level: p.priceLevel !== undefined ? PRICE_LEVELS[p.priceLevel] ?? null : null,
    open_now: p.currentOpeningHours?.openNow ?? null,
    primary_type: p.primaryType?.slice(0, 60) ?? null,
  };
}

export interface TextSearchRequest {
  query: string;
  center: { lat: number; lng: number };
  radiusM: number;
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
 * Runs one Text Search biased to a circle. Failures become HttpErrors: 401/403 → misconfigured,
 * 429/5xx/network → 503, timeout → 504, anything else → 502.
 */
export async function searchText(req: TextSearchRequest): Promise<Place[]> {
  const doFetch = req.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(TEXT_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": req.apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: req.query,
        pageSize: MAX_RESULTS,
        languageCode: "en",
        locationBias: {
          circle: {
            center: { latitude: req.center.lat, longitude: req.center.lng },
            radius: req.radiusM,
          },
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new HttpError("upstream_timeout", "Nearby search took too long. Try again.");
    }
    console.error("places request failed", error);
    throw unavailable("Nearby search could not be reached. Try again shortly.");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("places api error", { status: res.status, body: text.slice(0, 300) });
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
  const seen = new Set<string>();
  const places: Place[] = [];
  for (const raw of parsed.data.places ?? []) {
    const place = toPlace(raw);
    if (place && !seen.has(place.id)) {
      seen.add(place.id);
      places.push(place);
    }
  }
  return places.slice(0, MAX_RESULTS);
}
