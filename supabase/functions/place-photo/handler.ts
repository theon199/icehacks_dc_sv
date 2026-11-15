/**
 * `place-photo`: a short-lived URL for one Google Places photo, so the API key stays on the
 * server.
 *
 * POST { photo_name, max_width } calls the Place Photos media endpoint with
 * `skipHttpRedirect=true` (the key goes in a header, never in a URL) and returns
 * `{ url, expires_at }`. Google does not state how long the photo URL lives, so `expires_at` is a
 * conservative one hour; the app keeps the URL in memory only. Each member has a daily quota
 * (`place_photo`, 200 by default). Without GOOGLE_PLACES_API_KEY the answer is 503.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireUser } from "../_shared/auth.ts";
import { denoEnv, type EnvReader, readEnv } from "../_shared/env.ts";
import { createHandler, type Handler, HttpError, json } from "../_shared/http.ts";
import { AI_QUOTAS, enforceQuota, type QuotaPolicy } from "../_shared/quota.ts";
import { parseBody } from "../_shared/validate.ts";
import { envInt } from "../prices/usage.ts";
import { PHOTO_NAME_PATTERN } from "../food-map/nearby.ts";

export const PHOTO_MEDIA_BASE = "https://places.googleapis.com/v1/";
export const URL_LIFETIME_MS = 3_600_000;
const TIMEOUT_MS = 8_000;

export const PlacePhotoInput = z.object({
  photo_name: z.string().regex(PHOTO_NAME_PATTERN, "Use a Places photo name."),
  max_width: z.number().int().min(200).max(1600),
});

const mediaSchema = z.looseObject({
  photoUri: z.url({ protocol: /^https$/ }),
});

export interface PlacePhotoCaller {
  enforceQuota(policy: QuotaPolicy): Promise<void>;
}

export interface PlacePhotoDeps {
  env: EnvReader;
  caller(req: Request): Promise<PlacePhotoCaller>;
  fetch: typeof fetch;
  now(): number;
}

export function placePhotoQuota(env: EnvReader): QuotaPolicy {
  return {
    ...AI_QUOTAS.place_photo,
    limit: envInt(env, "FAMARA_PLACE_PHOTO_USER_DAILY_LIMIT", AI_QUOTAS.place_photo.limit, {
      min: 1,
      max: 10_000,
    }),
  };
}

export function photoMediaUrl(photoName: string, maxWidth: number): string {
  const params = new URLSearchParams({ maxWidthPx: String(maxWidth), skipHttpRedirect: "true" });
  return `${PHOTO_MEDIA_BASE}${photoName}/media?${params}`;
}

export function createPlacePhotoHandler(deps: PlacePhotoDeps): Handler {
  return createHandler(async (req) => {
    const caller = await deps.caller(req);
    const input = await parseBody(req, PlacePhotoInput, { maxBytes: 2 * 1024 });
    const apiKey = readEnv(["GOOGLE_PLACES_API_KEY"], deps.env);
    if (!apiKey) {
      throw new HttpError("upstream_unavailable", "Photos are not available right now.", {
        details: { reason: "not_configured" },
      });
    }
    await caller.enforceQuota(placePhotoQuota(deps.env));

    let res: Response;
    try {
      res = await deps.fetch(photoMediaUrl(input.photo_name, input.max_width), {
        method: "GET",
        headers: { "X-Goog-Api-Key": apiKey },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new HttpError("upstream_timeout", "The photo took too long. Try again.");
      }
      console.error("place photo request failed", error instanceof Error ? error.name : "unknown");
      throw new HttpError("upstream_unavailable", "The photo could not be reached.", {
        details: { reason: "places_unavailable" },
      });
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      console.error("place photo api error", { status: res.status });
      if (res.status === 400 || res.status === 404) {
        throw new HttpError("not_found", "That photo is no longer available.");
      }
      if (res.status === 401 || res.status === 403) {
        throw new HttpError("misconfigured", "Photos are not configured correctly.");
      }
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = res.headers.get("retry-after");
        throw new HttpError("upstream_unavailable", "Photos are busy. Try again shortly.", {
          headers: retryAfter ? { "Retry-After": retryAfter } : {},
          details: { reason: "places_unavailable" },
        });
      }
      throw new HttpError("upstream_error", "The photo could not be loaded.");
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new HttpError("upstream_error", "The photo service returned an unreadable response.");
    }
    const parsed = mediaSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError("upstream_error", "The photo service returned an unexpected response.");
    }
    return json({
      url: parsed.data.photoUri,
      expires_at: new Date(deps.now() + URL_LIFETIME_MS).toISOString(),
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Production wiring
// ---------------------------------------------------------------------------------------------

export function supabasePlacePhotoCaller(client: SupabaseClient, now: () => number) {
  return {
    async enforceQuota(policy: QuotaPolicy) {
      await enforceQuota(client, policy, now);
    },
  };
}

export function defaultPlacePhotoDeps(env: EnvReader = denoEnv): PlacePhotoDeps {
  return {
    env,
    async caller(req) {
      const ctx = await requireUser(req, { env });
      return supabasePlacePhotoCaller(ctx.client, Date.now);
    },
    fetch: (input, init) => fetch(input, init),
    now: Date.now,
  };
}
