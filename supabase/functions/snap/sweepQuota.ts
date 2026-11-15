/**
 * What each kind of Snap request costs.
 *
 * - One photo spends one pantry or dish Snap from the daily allowance.
 * - A fridge sweep spends one pantry Snap for the whole pass. Each batch spends a unit of a
 *   counter of its own (`swf_<sweep>`, four batches an hour), and the batch that finds that counter
 *   fresh is the one that pays the daily Snap. A fifth batch is turned away.
 * - Words spend `snap_text`. Words tied to a sweep also spend that pass's word counter
 *   (`swt_<sweep>`), so a pass holds at most two of them.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { denoEnv, type EnvReader, readEnv } from "../_shared/env.ts";
import { HttpError } from "../_shared/http.ts";
import {
  AI_QUOTAS,
  consumeQuota,
  enforceQuota,
  type QuotaPolicy,
  type QuotaResult,
} from "../_shared/quota.ts";
import { SWEEP_LIMITS, SWEEP_MAX_BATCHES } from "./schema.ts";

const QUOTA_ENV = {
  pantry: "FAMARA_AI_LIMIT_SNAP_PANTRY",
  dish: "FAMARA_AI_LIMIT_SNAP_DISH",
} as const;

/** A sweep is one pass in front of the fridge; an hour is far longer than any real one takes. */
const SWEEP_WINDOW_SECONDS = 3_600;

/** Daily allowance per mode, overridable with `FAMARA_AI_LIMIT_SNAP_PANTRY` / `_DISH`. */
export function snapQuota(mode: "pantry" | "dish", env: EnvReader = denoEnv): QuotaPolicy {
  const base = mode === "pantry" ? AI_QUOTAS.snap_pantry : AI_QUOTAS.snap_dish;
  const name = QUOTA_ENV[mode];
  const raw = readEnv([name], env);
  if (raw === undefined) return base;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
    console.warn(`ignoring invalid ${name}; using the default`);
    return base;
  }
  return { ...base, limit };
}

/** The sweep's UUID as 32 lowercase hex characters: quota feature names allow only `[a-z0-9_]`. */
const sweepKey = (sweepId: string) => sweepId.replace(/-/g, "").toLowerCase();

export function sweepFramesPolicy(sweepId: string): QuotaPolicy {
  return {
    feature: `swf_${sweepKey(sweepId)}`,
    limit: SWEEP_MAX_BATCHES,
    windowSeconds: SWEEP_WINDOW_SECONDS,
  };
}

export function sweepWordsPolicy(sweepId: string): QuotaPolicy {
  return {
    feature: `swt_${sweepKey(sweepId)}`,
    limit: SWEEP_LIMITS.maxTextCalls,
    windowSeconds: SWEEP_WINDOW_SECONDS,
  };
}

function sweepSpent(result: QuotaResult, now: () => number, message: string): HttpError {
  const retryAfter = Math.max(1, Math.ceil((result.resetAt.getTime() - now()) / 1000));
  return new HttpError("quota_exceeded", message, {
    // The sweep id stays out of the details: it is the app's, and says nothing useful here.
    details: { feature: "snap_sweep", reset_at: result.resetAt.toISOString() },
    headers: { "Retry-After": String(retryAfter) },
  });
}

/**
 * Spends one batch of a sweep. The first batch also spends the daily pantry Snap and reports what
 * is left of it; later batches report how many batches the pass has left.
 */
export async function spendSweepBatch(
  client: SupabaseClient,
  sweepId: string,
  env: EnvReader = denoEnv,
  now: () => number = Date.now,
): Promise<QuotaResult> {
  const policy = sweepFramesPolicy(sweepId);
  const sweep = await consumeQuota(client, policy);
  if (!sweep.allowed) {
    throw sweepSpent(sweep, now, "This sweep has sent all its frames. Start a new one.");
  }
  if (sweep.remaining !== policy.limit - 1) return sweep;
  try {
    return await enforceQuota(client, snapQuota("pantry", env), now);
  } catch (error) {
    // The first batch was turned away, but the pass's counter is already started: later batches
    // would pass as "not the first" without ever paying. Use the counter up so they are refused.
    for (let left = sweep.remaining; left > 0; left -= 1) {
      const burnt = await consumeQuota(client, policy);
      if (!burnt.allowed) break;
    }
    throw error;
  }
}

/** Spends one call of words: always `snap_text`, and the sweep's own word counter when given. */
export async function spendWords(
  client: SupabaseClient,
  sweepId: string | undefined,
  now: () => number = Date.now,
): Promise<QuotaResult> {
  if (sweepId !== undefined) {
    const words = await consumeQuota(client, sweepWordsPolicy(sweepId));
    if (!words.allowed) {
      throw sweepSpent(words, now, "This sweep has already added what was said. Start a new one.");
    }
  }
  return await enforceQuota(client, AI_QUOTAS.snap_text, now);
}
