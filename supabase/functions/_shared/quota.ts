/**
 * Per-user AI quotas, backed by the `consume_ai_quota` RPC (atomic fixed-window counters).
 * Call `enforceQuota` before every billable AI request.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { HttpError } from "./http.ts";
import { callRpc } from "./rpc.ts";

export interface QuotaPolicy {
  /** Lowercase identifier, e.g. "chef". */
  feature: string;
  /** Calls allowed per window. */
  limit: number;
  /** Window length in seconds (60 .. 30 days). */
  windowSeconds: number;
}

export interface QuotaResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

const DAY = 86_400;

/** Default daily allowances per AI feature. */
export const AI_QUOTAS = {
  chef: { feature: "chef", limit: 60, windowSeconds: DAY },
  makeover: { feature: "makeover", limit: 20, windowSeconds: DAY },
  snap_dish: { feature: "snap_dish", limit: 20, windowSeconds: DAY },
  snap_pantry: { feature: "snap_pantry", limit: 20, windowSeconds: DAY },
  prices: { feature: "prices", limit: 100, windowSeconds: DAY },
  nearby_chat: { feature: "nearby_chat", limit: 30, windowSeconds: DAY },
  text_review: { feature: "text_review", limit: 200, windowSeconds: DAY },
} as const satisfies Record<string, QuotaPolicy>;

const quotaRows = z
  .array(z.object({
    allowed: z.boolean(),
    remaining: z.number().int().nonnegative(),
    reset_at: z.string(),
  }))
  .length(1);

/** Spends one unit of the caller's quota and reports what is left. */
export async function consumeQuota(
  client: SupabaseClient,
  policy: QuotaPolicy,
): Promise<QuotaResult> {
  const [row] = await callRpc(client, "consume_ai_quota", {
    p_feature: policy.feature,
    p_limit: policy.limit,
    p_window_seconds: policy.windowSeconds,
  }, quotaRows);
  if (!row) throw new HttpError("upstream_error", "The quota check returned no result.");
  const resetAt = new Date(row.reset_at);
  if (Number.isNaN(resetAt.getTime())) {
    throw new HttpError("upstream_error", "The quota check returned an invalid reset time.");
  }
  return { allowed: row.allowed, remaining: row.remaining, resetAt };
}

/** Like consumeQuota, but throws 429 `quota_exceeded` (with Retry-After) once the limit is hit. */
export async function enforceQuota(
  client: SupabaseClient,
  policy: QuotaPolicy,
  now: () => number = Date.now,
): Promise<QuotaResult> {
  const result = await consumeQuota(client, policy);
  if (!result.allowed) {
    const retryAfter = Math.max(1, Math.ceil((result.resetAt.getTime() - now()) / 1000));
    throw new HttpError(
      "quota_exceeded",
      "You have reached today's limit for this feature. Try again later.",
      {
        details: { feature: policy.feature, reset_at: result.resetAt.toISOString() },
        headers: { "Retry-After": String(retryAfter) },
      },
    );
  }
  return result;
}
