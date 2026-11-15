/**
 * Google Places API (New) Place Details for a place the server has not seen yet, with the
 * smallest field mask that gives a name, a position and the types the healthy rule reads. The
 * mask is billed as Place Details Pro (`displayName` and `primaryType`; `id`, `location` and
 * `types` are Essentials).
 */

import { z } from "zod";
import { HttpError } from "../_shared/http.ts";

export const PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places/";
export const DETAILS_FIELD_MASK = "id,displayName,location,primaryType,types";
const TIMEOUT_MS = 8_000;

export interface PlaceDetails {
  id: string;
  name: string;
  lat: number;
  lng: number;
  primary_type: string | null;
  types: string[];
}

const detailsSchema = z.looseObject({
  id: z.string().min(1).max(300),
  displayName: z.looseObject({ text: z.string() }).optional(),
  location: z.looseObject({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  primaryType: z.string().max(60).optional(),
  types: z.array(z.string()).optional(),
});

/**
 * Looks a place up. Returns null when Google does not know the id (400 or 404). Other failures
 * become HttpErrors: 401/403 → misconfigured, 429/5xx/network → 503, timeout → 504, else 502.
 */
export async function placeDetails(
  placeId: string,
  apiKey: string,
  doFetch: typeof fetch = fetch,
): Promise<PlaceDetails | null> {
  let res: Response;
  try {
    res = await doFetch(`${PLACE_DETAILS_URL}${encodeURIComponent(placeId)}?languageCode=en`, {
      method: "GET",
      headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": DETAILS_FIELD_MASK },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new HttpError("upstream_timeout", "Looking up the place took too long. Try again.");
    }
    console.error("place details request failed", error instanceof Error ? error.name : "unknown");
    throw new HttpError("upstream_unavailable", "The place lookup could not be reached.", {
      details: { reason: "places_unavailable" },
    });
  }
  if (res.status === 400 || res.status === 404) {
    await res.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    console.error("place details api error", { status: res.status });
    if (res.status === 401 || res.status === 403) {
      throw new HttpError("misconfigured", "The place lookup is not configured correctly.");
    }
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = res.headers.get("retry-after");
      throw new HttpError("upstream_unavailable", "The place lookup is busy. Try again shortly.", {
        headers: retryAfter ? { "Retry-After": retryAfter } : {},
        details: { reason: "places_unavailable" },
      });
    }
    throw new HttpError("upstream_error", "The place lookup could not answer that request.");
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new HttpError("upstream_error", "The place lookup returned an unreadable response.");
  }
  const parsed = detailsSchema.safeParse(body);
  const name = parsed.success ? parsed.data.displayName?.text.trim() : undefined;
  if (!parsed.success || !name) return null;
  return {
    id: parsed.data.id,
    name: name.slice(0, 200),
    lat: parsed.data.location.latitude,
    lng: parsed.data.location.longitude,
    primary_type: parsed.data.primaryType || null,
    types: (parsed.data.types ?? []).slice(0, 40),
  };
}
