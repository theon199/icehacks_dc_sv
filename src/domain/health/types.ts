/**
 * Shapes shared by the health rules. Every timestamp is epoch milliseconds so the rules stay pure
 * and the caller decides what "now" is.
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** Broad workout families; each carries one intensity weight. */
export const WORKOUT_KINDS = [
  'walking',
  'running',
  'cycling',
  'swimming',
  'strength',
  'intervals',
  'cardio',
  'sports',
  'mind_body',
  'other',
] as const;
export type WorkoutKind = (typeof WORKOUT_KINDS)[number];

export interface WorkoutSession {
  start: number;
  end: number;
  kind: WorkoutKind;
}

/** A stretch of time the person was asleep (time in bed or awake is not included). */
export interface SleepInterval {
  start: number;
  end: number;
}

/** One glucose reading, always in mg/dL. */
export interface GlucoseReading {
  at: number;
  mgdl: number;
}

/** A dish the person logged as cooked; `startedAt` is when they sat down to eat it. */
export interface CookedMeal {
  id: string;
  recipeRef: string;
  startedAt: number;
  /** The person's calendar day for the meal, `YYYY-MM-DD`. */
  localDate: string;
}
