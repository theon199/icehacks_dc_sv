/**
 * Turns clean meal/glucose pairs into per-dish observations. Every comparison is against the
 * person's own typical rise, never a clinical target, and nothing is said until there is enough
 * data for it to mean something.
 */
import { DAY_MS } from './types';
import type { GlucosePair } from './glucosePairing';

export const GLUCOSE_INSIGHT_RULES = {
  /** Pairs a dish needs before it can be called steadier. */
  minPairsPerDish: 3,
  /** Distinct days with at least one pair before any dish is called steadier. */
  minPairedDays: 12,
  /** A steadier dish's typical rise is at most this share of the person's overall typical rise… */
  steadierRatio: 0.75,
  /** …and at least this many mg/dL lower, so small numbers do not produce labels. */
  minDifferenceMgdl: 10,
  /** Pairs older than this are dropped. */
  retentionMs: 180 * DAY_MS,
} as const;

export type GlucoseInsightStatus = 'no_data' | 'collecting' | 'ready';

export interface DishGlucoseStat {
  recipeRef: string;
  pairCount: number;
  medianRiseMgdl: number;
  steadier: boolean;
}

export interface GlucoseSummary {
  status: GlucoseInsightStatus;
  pairCount: number;
  pairedDays: number;
  /** Days still needed before insights show; 0 once ready. */
  daysRemaining: number;
  overallMedianRiseMgdl: number | null;
  /** Dishes with enough pairs, steadier ones first, then by typical rise. */
  dishes: DishGlucoseStat[];
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const upper = sorted[mid] ?? 0;
  if (sorted.length % 2 === 1) return upper;
  const lower = sorted[mid - 1] ?? upper;
  return (lower + upper) / 2;
}

/** Drops pairs past retention or from the future, and keeps one pair per meal (the newest). */
export function prunePairs(pairs: readonly GlucosePair[], now: number): GlucosePair[] {
  const cutoff = now - GLUCOSE_INSIGHT_RULES.retentionMs;
  const byMeal = new Map<string, GlucosePair>();
  for (const pair of pairs) {
    if (pair.startedAt < cutoff || pair.startedAt > now) continue;
    byMeal.set(pair.mealId, pair);
  }
  return [...byMeal.values()].sort((a, b) => a.startedAt - b.startedAt);
}

/**
 * Replaces the stored pairs for every meal that was evaluated again (paired or not) with the fresh
 * result, keeps the rest, and applies retention.
 */
export function mergePairs(input: {
  stored: readonly GlucosePair[];
  fresh: readonly GlucosePair[];
  reevaluatedMealIds: ReadonlySet<string>;
  now: number;
}): GlucosePair[] {
  const kept = input.stored.filter((pair) => !input.reevaluatedMealIds.has(pair.mealId));
  return prunePairs([...kept, ...input.fresh], input.now);
}

export function summarizeGlucose(pairs: readonly GlucosePair[], now: number): GlucoseSummary {
  const rules = GLUCOSE_INSIGHT_RULES;
  const live = prunePairs(pairs, now);
  const pairedDays = new Set(live.map((pair) => pair.localDate)).size;
  const daysRemaining = Math.max(0, rules.minPairedDays - pairedDays);
  const overall = median(live.map((pair) => pair.riseMgdl));
  const status: GlucoseInsightStatus =
    live.length === 0 ? 'no_data' : daysRemaining > 0 ? 'collecting' : 'ready';

  const byDish = new Map<string, number[]>();
  for (const pair of live) {
    const rises = byDish.get(pair.recipeRef) ?? [];
    rises.push(pair.riseMgdl);
    byDish.set(pair.recipeRef, rises);
  }

  const dishes: DishGlucoseStat[] = [];
  for (const [recipeRef, rises] of byDish) {
    if (rises.length < rules.minPairsPerDish) continue;
    const dishMedian = median(rises) ?? 0;
    const steadier =
      status === 'ready' &&
      overall !== null &&
      dishMedian <= overall * rules.steadierRatio &&
      overall - dishMedian >= rules.minDifferenceMgdl;
    dishes.push({
      recipeRef,
      pairCount: rises.length,
      medianRiseMgdl: Math.round(dishMedian),
      steadier,
    });
  }
  dishes.sort(
    (a, b) =>
      Number(b.steadier) - Number(a.steadier) ||
      a.medianRiseMgdl - b.medianRiseMgdl ||
      a.recipeRef.localeCompare(b.recipeRef),
  );

  return {
    status,
    pairCount: live.length,
    pairedDays,
    daysRemaining,
    overallMedianRiseMgdl: overall === null ? null : Math.round(overall),
    dishes,
  };
}
