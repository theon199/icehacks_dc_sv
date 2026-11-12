/**
 * Pairs each cooked meal with the glucose readings that followed it, keeping only clean windows: a
 * reading at the start to compare against, enough readings with no long holes, and nothing else
 * (another meal, a workout) that would muddy what the dish did.
 */
import { MINUTE_MS, type CookedMeal, type GlucoseReading, type WorkoutSession } from './types';

export const GLUCOSE_PAIRING_RULES = {
  /** Readings are followed for this long after the meal starts. */
  windowMs: 120 * MINUTE_MS,
  /** The baseline is the latest reading at most this long before (or exactly at) the start. */
  baselineLeadMs: 10 * MINUTE_MS,
  /** Fewest readings (baseline included) for a usable window. */
  minSamples: 6,
  /** Longest allowed gap between readings, and between the last reading and the window end. */
  maxGapMs: 45 * MINUTE_MS,
  /** Another meal starting this close before or after makes the window ambiguous. */
  otherMealMs: 120 * MINUTE_MS,
  /** Readings outside this range are sensor errors, not glucose. */
  plausibleMgdl: { min: 20, max: 600 },
} as const;

export type PairingExclusion =
  | 'window_open'
  | 'no_baseline'
  | 'too_few_samples'
  | 'gap_too_long'
  | 'overlapping_meal'
  | 'workout_in_window';

export interface GlucosePair {
  mealId: string;
  recipeRef: string;
  localDate: string;
  startedAt: number;
  baselineMgdl: number;
  peakMgdl: number;
  /** Peak minus baseline, never negative. */
  riseMgdl: number;
  minutesToPeak: number;
  sampleCount: number;
}

export type PairingOutcome =
  { ok: true; pair: GlucosePair } | { ok: false; mealId: string; reason: PairingExclusion };

/** Sorted, de-duplicated, plausible readings. Run once before pairing many meals. */
export function prepareReadings(readings: readonly GlucoseReading[]): GlucoseReading[] {
  const { min, max } = GLUCOSE_PAIRING_RULES.plausibleMgdl;
  const sorted = readings
    .filter((reading) => Number.isFinite(reading.at) && reading.mgdl >= min && reading.mgdl <= max)
    .slice()
    .sort((a, b) => a.at - b.at);
  const unique: GlucoseReading[] = [];
  for (const reading of sorted) {
    const last = unique[unique.length - 1];
    // Two sources writing the same instant count once.
    if (last && last.at === reading.at) continue;
    unique.push(reading);
  }
  return unique;
}

/** Index of the first reading at or after `at` (binary search over sorted readings). */
function firstAtOrAfter(readings: readonly GlucoseReading[], at: number): number {
  let lo = 0;
  let hi = readings.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((readings[mid]?.at ?? Infinity) < at) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export interface PairingContext {
  /** Output of `prepareReadings`. */
  readings: readonly GlucoseReading[];
  /** Every logged meal around this one, including itself. */
  meals: readonly CookedMeal[];
  workouts: readonly WorkoutSession[];
  now: number;
}

/** Evaluates one meal. Rules are checked in a fixed order so the reported reason is stable. */
export function pairMeal(meal: CookedMeal, context: PairingContext): PairingOutcome {
  const rules = GLUCOSE_PAIRING_RULES;
  const start = meal.startedAt;
  const windowEnd = start + rules.windowMs;
  const excluded = (reason: PairingExclusion): PairingOutcome => ({
    ok: false,
    mealId: meal.id,
    reason,
  });

  if (context.now < windowEnd) return excluded('window_open');

  const crowded = context.meals.some(
    (other) => other.id !== meal.id && Math.abs(other.startedAt - start) <= rules.otherMealMs,
  );
  if (crowded) return excluded('overlapping_meal');

  const moved = context.workouts.some(
    (workout) => workout.start < windowEnd && workout.end > start,
  );
  if (moved) return excluded('workout_in_window');

  const { readings } = context;
  const fromIndex = firstAtOrAfter(readings, start - rules.baselineLeadMs);
  const startIndex = firstAtOrAfter(readings, start);
  // The baseline is the reading closest to the start without going past it.
  const atStart = readings[startIndex];
  const baselineIndex = atStart && atStart.at === start ? startIndex : startIndex - 1;
  const baseline = baselineIndex >= fromIndex ? readings[baselineIndex] : undefined;
  if (!baseline) return excluded('no_baseline');

  const endIndex = firstAtOrAfter(readings, windowEnd + 1);
  const used = readings.slice(baselineIndex, endIndex);
  if (used.length < rules.minSamples) return excluded('too_few_samples');

  let peak = baseline;
  for (let i = 1; i < used.length; i += 1) {
    const previous = used[i - 1];
    const current = used[i];
    if (!previous || !current) continue;
    if (current.at - previous.at > rules.maxGapMs) return excluded('gap_too_long');
    if (current.mgdl > peak.mgdl) peak = current;
  }
  const last = used[used.length - 1];
  if (!last || windowEnd - last.at > rules.maxGapMs) return excluded('gap_too_long');

  return {
    ok: true,
    pair: {
      mealId: meal.id,
      recipeRef: meal.recipeRef,
      localDate: meal.localDate,
      startedAt: start,
      baselineMgdl: Math.round(baseline.mgdl),
      peakMgdl: Math.round(peak.mgdl),
      riseMgdl: Math.max(0, Math.round(peak.mgdl - baseline.mgdl)),
      minutesToPeak: Math.max(0, Math.round((peak.at - start) / MINUTE_MS)),
      sampleCount: used.length,
    },
  };
}

export interface PairingResult {
  pairs: GlucosePair[];
  excluded: { mealId: string; reason: PairingExclusion }[];
}

/** Pairs every meal; readings may arrive unsorted and from several sources. */
export function pairMeals(input: {
  meals: readonly CookedMeal[];
  readings: readonly GlucoseReading[];
  workouts: readonly WorkoutSession[];
  now: number;
}): PairingResult {
  const context: PairingContext = {
    readings: prepareReadings(input.readings),
    meals: input.meals,
    workouts: input.workouts,
    now: input.now,
  };
  const result: PairingResult = { pairs: [], excluded: [] };
  for (const meal of input.meals) {
    const outcome = pairMeal(meal, context);
    if (outcome.ok) result.pairs.push(outcome.pair);
    else result.excluded.push({ mealId: outcome.mealId, reason: outcome.reason });
  }
  return result;
}
