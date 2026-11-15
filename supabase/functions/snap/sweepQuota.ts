/**
 * What each kind of Snap request costs.
 *
 * - One photo spends one pantry or dish Snap from the daily allowance.
 * - A fridge sweep spends one pantry Snap for the whole pass. The sweep lives in
 *   `private.snap_sweeps`, which only the service role can write: its first batch opens it and pays
 *   the daily Snap in one transaction, later batches wait on the sweep's row lock and pass only once
 *   it is paid, and a sweep whose payment was refused stays refused. A sweep lasts an hour from its
 *   first request and holds four batches of frames.
 * - Words spend `snap_text`. Words tied to a sweep also spend one of that pass's two calls of words.
 *
 * The sweep RPCs take the user id from the verified session, never from the request body.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { denoEnv, type EnvReader, readEnv } from "../_shared/env.ts";
import { HttpError } from "../_shared/http.ts";
import { AI_QUOTAS, enforceQuota, type QuotaPolicy, type QuotaResult } from "../_shared/quota.ts";
import { callRpc } from "../_shared/rpc.ts";

const QUOTA_ENV = {
  pantry: "FAMARA_AI_LIMIT_SNAP_PANTRY",
  dish: "FAMARA_AI_LIMIT_SNAP_DISH",
} as const;

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

const SweepReason = z.enum([
  "paid",
  "batch",
  "words",
  "daily_limit",
  "refused",
  "expired",
  "spent",
]);
type SweepReason = z.infer<typeof SweepReason>;

const sweepRows = z
  .array(z.object({
    allowed: z.boolean(),
    reason: SweepReason,
    remaining: z.number().int().min(0),
    reset_at: z.string(),
  }))
  .length(1);

/** The service-role client and the verified caller the sweep belongs to. */
export interface SweepAccount {
  service: SupabaseClient;
  userId: string;
}

type Refusal = Exclude<SweepReason, "paid" | "batch" | "words">;

const SWEEP_RPC = {
  batch: {
    fn: "spend_snap_sweep_batch",
    spent: "This sweep has sent all its frames. Start a new one.",
  },
  words: {
    fn: "spend_snap_sweep_words",
    spent: "This sweep has already added what was said. Start a new one.",
  },
} as const;

const DAILY_LIMIT = "You have reached today's limit for this feature. Try again later.";

function refusal(
  kind: keyof typeof SWEEP_RPC,
  reason: Refusal,
  resetAt: Date,
  now: () => number,
): HttpError {
  const retryAfter = Math.max(1, Math.ceil((resetAt.getTime() - now()) / 1000));
  // A sweep refused at the daily limit stays refused: the app is told it is the daily limit.
  const daily = reason === "daily_limit" || reason === "refused";
  const message = daily
    ? DAILY_LIMIT
    : reason === "expired"
    ? "This sweep has ended. Start a new one."
    : SWEEP_RPC[kind].spent;
  return new HttpError("quota_exceeded", message, {
    // The sweep id stays out of the details: it is the app's, and says nothing useful here.
    details: { feature: daily ? "snap_pantry" : "snap_sweep", reset_at: resetAt.toISOString() },
    headers: { "Retry-After": String(retryAfter) },
  });
}

async function spendSweep(
  account: SweepAccount,
  kind: keyof typeof SWEEP_RPC,
  args: Record<string, unknown>,
  now: () => number,
): Promise<QuotaResult> {
  const [row] = await callRpc(
    account.service,
    SWEEP_RPC[kind].fn,
    { p_user_id: account.userId, ...args },
    sweepRows,
  );
  if (!row) throw new HttpError("upstream_error", "The sweep check returned no result.");
  const resetAt = new Date(row.reset_at);
  if (Number.isNaN(resetAt.getTime())) {
    throw new HttpError("upstream_error", "The sweep check returned an invalid reset time.");
  }
  if (!row.allowed) {
    if (row.reason === "paid" || row.reason === "batch" || row.reason === "words") {
      throw new HttpError("upstream_error", "The sweep check returned an inconsistent result.");
    }
    throw refusal(kind, row.reason, resetAt, now);
  }
  return { allowed: true, remaining: row.remaining, resetAt };
}

/**
 * Spends one batch of a sweep. The first batch also spends the daily pantry Snap and reports what
 * is left of it; later batches report how many batches the pass has left.
 */
export async function spendSweepBatch(
  account: SweepAccount,
  sweepId: string,
  env: EnvReader = denoEnv,
  now: () => number = Date.now,
): Promise<QuotaResult> {
  return await spendSweep(account, "batch", {
    p_sweep_id: sweepId,
    p_daily_limit: snapQuota("pantry", env).limit,
  }, now);
}

/** Spends one call of words: always `snap_text`, and one of the sweep's own when given. */
export async function spendWords(
  client: SupabaseClient,
  sweep: { account: SweepAccount; sweepId: string } | undefined,
  now: () => number = Date.now,
): Promise<QuotaResult> {
  if (sweep !== undefined) {
    await spendSweep(sweep.account, "words", { p_sweep_id: sweep.sweepId }, now);
  }
  return await enforceQuota(client, AI_QUOTAS.snap_text, now);
}
