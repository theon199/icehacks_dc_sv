/**
 * Spending guards for edge functions that call paid upstream APIs: per-period usage budgets
 * (a member's daily allowance, a global monthly allowance) and single-flight leases so that
 * concurrent requests never pay twice for the same cache entry.
 *
 * Both are backed by service-role RPCs (`reserve_usage`, `release_usage`, `claim_fill_leases`,
 * `release_fill_leases`). The `UsageGuards` interface keeps handlers testable without a database.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { EnvReader } from "../_shared/env.ts";
import { readEnv } from "../_shared/env.ts";
import { callRpc } from "../_shared/rpc.ts";

export type BudgetPeriod = "day" | "month";

export interface UsageGuards {
  /** Grants up to `units` from the bucket's allowance for the current UTC period. */
  reserve(bucket: string, period: BudgetPeriod, units: number, limit: number): Promise<number>;
  /** Gives back reserved units that were not used. */
  release(bucket: string, period: BudgetPeriod, units: number): Promise<void>;
  /** Claims the free keys for `holder`; returns the keys it now holds. */
  claimLeases(keys: readonly string[], holder: string, ttlSeconds: number): Promise<string[]>;
  /** Releases keys held by `holder`. */
  releaseLeases(keys: readonly string[], holder: string): Promise<void>;
}

const LEASE_BATCH = 100;

/** Usage guards over the service-role RPCs. */
export function supabaseUsageGuards(service: SupabaseClient): UsageGuards {
  return {
    async reserve(bucket, period, units, limit) {
      if (units <= 0) return 0;
      return await callRpc(service, "reserve_usage", {
        p_bucket: bucket,
        p_period: period,
        p_units: units,
        p_limit: limit,
      }, z.number().int().min(0));
    },
    async release(bucket, period, units) {
      if (units <= 0) return;
      await callRpc(service, "release_usage", {
        p_bucket: bucket,
        p_period: period,
        p_units: units,
      }, z.unknown());
    },
    async claimLeases(keys, holder, ttlSeconds) {
      const claimed: string[] = [];
      for (let i = 0; i < keys.length; i += LEASE_BATCH) {
        const batch = keys.slice(i, i + LEASE_BATCH);
        const rows = await callRpc(service, "claim_fill_leases", {
          p_keys: batch,
          p_holder: holder,
          p_ttl_seconds: ttlSeconds,
        }, z.array(z.string()));
        claimed.push(...rows);
      }
      return claimed;
    },
    async releaseLeases(keys, holder) {
      for (let i = 0; i < keys.length; i += LEASE_BATCH) {
        await callRpc(service, "release_fill_leases", {
          p_keys: keys.slice(i, i + LEASE_BATCH),
          p_holder: holder,
        }, z.number().int());
      }
    },
  };
}

/**
 * Reserves `units` from a member's allowance and then from the global allowance, giving the
 * member's units back when the global allowance had fewer left. Returns what both granted and
 * which allowance ran short first.
 */
export async function reserveFromBoth(
  guards: UsageGuards,
  member: { bucket: string; period: BudgetPeriod; limit: number },
  global: { bucket: string; period: BudgetPeriod; limit: number },
  units: number,
): Promise<{ granted: number; limitedBy: "member" | "global" | null }> {
  if (units <= 0) return { granted: 0, limitedBy: null };
  const memberGrant = await guards.reserve(member.bucket, member.period, units, member.limit);
  if (memberGrant === 0) return { granted: 0, limitedBy: "member" };
  let globalGrant = 0;
  try {
    globalGrant = await guards.reserve(global.bucket, global.period, memberGrant, global.limit);
  } catch (error) {
    await guards.release(member.bucket, member.period, memberGrant).catch(() => undefined);
    throw error;
  }
  if (globalGrant < memberGrant) {
    await guards.release(member.bucket, member.period, memberGrant - globalGrant);
  }
  const limitedBy = globalGrant < memberGrant ? "global" : memberGrant < units ? "member" : null;
  return { granted: globalGrant, limitedBy };
}

/**
 * Reads a whole-number setting. Missing values use the default; values that do not parse or fall
 * outside [min, max] are logged and replaced by the default, so a typo never removes a limit.
 */
export function envInt(
  env: EnvReader,
  name: string,
  fallback: number,
  bounds: { min: number; max: number },
): number {
  const raw = readEnv([name], env);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < bounds.min || value > bounds.max) {
    console.warn(`ignoring invalid ${name}; using ${fallback}`);
    return fallback;
  }
  return value;
}

/** Runs `task` after the response is sent when the edge runtime supports it. */
export function runInBackground(task: Promise<unknown>): void {
  const guarded = task.catch((error) => console.error("background task failed", error));
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  if (typeof runtime?.waitUntil === "function") runtime.waitUntil(guarded);
}

/** Maps `items` through `work` with at most `limit` running at once. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index] as T);
    }
  });
  await Promise.all(lanes);
  return results;
}
