/**
 * Day context: a short-lived summary of how active the person has been and how they slept, used to
 * nudge suggestions (more protein after a hard day, an earlier lighter dinner after a short night).
 * It never labels the person, and it lapses on its own after a day.
 */
import {
  DAY_MS,
  MINUTE_MS,
  type SleepInterval,
  type WorkoutKind,
  type WorkoutSession,
} from './types';

/** How much one minute of each workout family counts towards the day's activity load. */
export const INTENSITY_WEIGHTS: Readonly<Record<WorkoutKind, number>> = {
  mind_body: 0.5,
  walking: 0.6,
  other: 0.8,
  strength: 1,
  cardio: 1.1,
  cycling: 1.1,
  sports: 1.1,
  swimming: 1.2,
  running: 1.3,
  intervals: 1.5,
};

export const DAY_CONTEXT_RULES = {
  /** Workouts and sleep are read from this far back. */
  lookbackMs: DAY_MS,
  /** A context stops applying this long after it was computed. */
  lifetimeMs: DAY_MS,
  /** Weighted-minute thresholds; at or above each one moves up a level. */
  lightFrom: 10,
  activeFrom: 30,
  veryActiveFrom: 60,
  /** Less tracked sleep than this (but some) counts as a short night. */
  shortSleepBelowMinutes: 6 * 60,
  /** A single workout longer than this is treated as a recording left running and capped. */
  maxWorkoutMinutes: 4 * 60,
} as const;

export type ActivityLevel = 'rest' | 'light' | 'active' | 'very_active';

/**
 * What the day context tells the person it is doing. Each one that changes ranking has a matching
 * field in `DayRankingHints`; `earlier_dinner` is a timing note only.
 */
export type DaySuggestion = 'more_protein' | 'lighter_dinner' | 'earlier_dinner';

export interface DayContext {
  computedAt: number;
  expiresAt: number;
  activity: ActivityLevel;
  /** Weighted workout minutes in the lookback window. */
  activityLoad: number;
  workoutMinutes: number;
  /** Tracked sleep in the lookback window, or null when there was none to read. */
  sleepMinutes: number | null;
  shortSleep: boolean;
  suggestions: DaySuggestion[];
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Minutes of `[start, end)` that fall inside `[from, to)`. */
function overlapMinutes(start: number, end: number, from: number, to: number): number {
  const lo = Math.max(start, from);
  const hi = Math.min(end, to);
  return hi > lo ? (hi - lo) / MINUTE_MS : 0;
}

/**
 * Total minutes covered by the intervals inside the window. Overlaps are merged first, because a
 * watch and a phone often record the same night.
 */
export function mergedMinutes(
  intervals: readonly SleepInterval[],
  from: number,
  to: number,
): number {
  const clipped = intervals
    .map((interval) => ({
      start: Math.max(interval.start, from),
      end: Math.min(interval.end, to),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start);

  let total = 0;
  let current: { start: number; end: number } | null = null;
  for (const interval of clipped) {
    if (current && interval.start <= current.end) {
      current.end = Math.max(current.end, interval.end);
    } else {
      if (current) total += current.end - current.start;
      current = { ...interval };
    }
  }
  if (current) total += current.end - current.start;
  return total / MINUTE_MS;
}

export function activityLevelFor(load: number): ActivityLevel {
  if (load >= DAY_CONTEXT_RULES.veryActiveFrom) return 'very_active';
  if (load >= DAY_CONTEXT_RULES.activeFrom) return 'active';
  if (load >= DAY_CONTEXT_RULES.lightFrom) return 'light';
  return 'rest';
}

export function suggestionsFor(activity: ActivityLevel, shortSleep: boolean): DaySuggestion[] {
  const suggestions: DaySuggestion[] = [];
  if (activity === 'active' || activity === 'very_active') suggestions.push('more_protein');
  if (shortSleep) suggestions.push('lighter_dinner', 'earlier_dinner');
  return suggestions;
}

export interface DayContextInput {
  workouts: readonly WorkoutSession[];
  sleep: readonly SleepInterval[];
  now: number;
}

/** Builds the day context from whatever workouts and sleep were recorded in the last day. */
export function computeDayContext({ workouts, sleep, now }: DayContextInput): DayContext {
  const from = now - DAY_CONTEXT_RULES.lookbackMs;

  let workoutMinutes = 0;
  let activityLoad = 0;
  for (const workout of workouts) {
    const minutes = Math.min(
      overlapMinutes(workout.start, workout.end, from, now),
      DAY_CONTEXT_RULES.maxWorkoutMinutes,
    );
    if (minutes <= 0) continue;
    workoutMinutes += minutes;
    activityLoad += minutes * INTENSITY_WEIGHTS[workout.kind];
  }

  const tracked = mergedMinutes(sleep, from, now);
  const sleepMinutes = tracked > 0 ? Math.round(tracked) : null;
  const shortSleep =
    sleepMinutes !== null && sleepMinutes < DAY_CONTEXT_RULES.shortSleepBelowMinutes;

  const activity = activityLevelFor(activityLoad);
  return {
    computedAt: now,
    expiresAt: now + DAY_CONTEXT_RULES.lifetimeMs,
    activity,
    activityLoad: round1(activityLoad),
    workoutMinutes: Math.round(workoutMinutes),
    sleepMinutes,
    shortSleep,
    suggestions: suggestionsFor(activity, shortSleep),
  };
}

/** A context applies from when it was computed until it expires; a clock set back voids it. */
export function isDayContextActive(context: DayContext | null, now: number): boolean {
  if (!context) return false;
  return now >= context.computedAt && now < context.expiresAt;
}

/**
 * How strongly Discover should lean towards protein-rich or lighter dishes today, each 0..1.
 * Zero for both whenever there is no active context, so ranking is unchanged.
 */
export interface DayRankingHints {
  protein: number;
  lighter: number;
}

export const NO_DAY_HINTS: DayRankingHints = Object.freeze({ protein: 0, lighter: 0 });

export function rankingHintsFor(context: DayContext | null, now: number): DayRankingHints {
  if (!context || !isDayContextActive(context, now)) return NO_DAY_HINTS;
  const protein = context.activity === 'very_active' ? 1 : context.activity === 'active' ? 0.6 : 0;
  const lighter = context.shortSleep ? 0.6 : 0;
  return { protein, lighter };
}
