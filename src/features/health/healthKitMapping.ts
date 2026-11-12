/**
 * Converts Apple Health samples into the plain shapes the health rules use. Kept free of the
 * native module so it can be tested and so importing it never loads HealthKit.
 */
import type { GlucoseReading, SleepInterval, WorkoutKind, WorkoutSession } from '@/domain/health';

/**
 * Apple's `HKWorkoutActivityType` raw values grouped into Famara's workout families. Anything not
 * listed counts as `other`.
 */
const WORKOUT_FAMILIES: Readonly<Record<number, WorkoutKind>> = {
  52: 'walking', // walking
  24: 'walking', // hiking
  70: 'walking', // wheelchair walk pace
  37: 'running', // running
  71: 'running', // wheelchair run pace
  49: 'running', // track and field
  13: 'cycling', // cycling
  74: 'cycling', // hand cycling
  46: 'swimming', // swimming
  53: 'swimming', // water fitness
  50: 'strength', // traditional strength training
  20: 'strength', // functional strength training
  59: 'strength', // core training
  63: 'intervals', // high intensity interval training
  64: 'intervals', // jump rope
  11: 'intervals', // cross training
  30: 'cardio', // mixed metabolic cardio training
  73: 'cardio', // mixed cardio
  16: 'cardio', // elliptical
  35: 'cardio', // rowing
  44: 'cardio', // stair climbing
  68: 'cardio', // stairs
  69: 'cardio', // step training
  77: 'cardio', // cardio dance
  14: 'cardio', // dance
  8: 'sports', // boxing
  65: 'sports', // kickboxing
  28: 'sports', // martial arts
  6: 'sports', // basketball
  41: 'sports', // soccer
  48: 'sports', // tennis
  79: 'sports', // pickleball
  60: 'sports', // cross-country skiing
  82: 'sports', // swim, bike, run
  57: 'mind_body', // yoga
  29: 'mind_body', // mind and body
  62: 'mind_body', // flexibility
  66: 'mind_body', // pilates
  58: 'mind_body', // barre
  72: 'mind_body', // tai chi
  80: 'mind_body', // cooldown
  33: 'mind_body', // preparation and recovery
};

export function workoutKindFor(activityType: number): WorkoutKind {
  return WORKOUT_FAMILIES[activityType] ?? 'other';
}

/** `HKCategoryValueSleepAnalysis` values that mean asleep (unspecified, core, deep, REM). */
const ASLEEP_VALUES: ReadonlySet<number> = new Set([1, 3, 4, 5]);

interface TimedSample {
  startDate: Date;
  endDate: Date;
}

const toMs = (date: Date) => date.getTime();
const isValidSpan = (start: number, end: number) =>
  Number.isFinite(start) && Number.isFinite(end) && end > start;

export function toWorkoutSessions(
  samples: readonly (TimedSample & { workoutActivityType: number })[],
): WorkoutSession[] {
  const sessions: WorkoutSession[] = [];
  for (const sample of samples) {
    const start = toMs(sample.startDate);
    const end = toMs(sample.endDate);
    if (!isValidSpan(start, end)) continue;
    sessions.push({ start, end, kind: workoutKindFor(sample.workoutActivityType) });
  }
  return sessions;
}

export function toSleepIntervals(
  samples: readonly (TimedSample & { value: number })[],
): SleepInterval[] {
  const intervals: SleepInterval[] = [];
  for (const sample of samples) {
    if (!ASLEEP_VALUES.has(sample.value)) continue;
    const start = toMs(sample.startDate);
    const end = toMs(sample.endDate);
    if (isValidSpan(start, end)) intervals.push({ start, end });
  }
  return intervals;
}

/** mg/dL per mmol/L for glucose. */
const MGDL_PER_MMOL = 18.0156;

export function toGlucoseReadings(
  samples: readonly (TimedSample & { quantity: number; unit: string })[],
): GlucoseReading[] {
  const readings: GlucoseReading[] = [];
  for (const sample of samples) {
    const at = toMs(sample.startDate);
    if (!Number.isFinite(at) || !Number.isFinite(sample.quantity)) continue;
    const unit = sample.unit.replace(/\s/g, '').toLowerCase();
    let mgdl: number;
    if (unit === 'mg/dl') mgdl = sample.quantity;
    else if (unit === 'mmol<180.15588000005408>/l' || unit === 'mmol/l') {
      mgdl = sample.quantity * MGDL_PER_MMOL;
    } else continue;
    readings.push({ at, mgdl });
  }
  return readings;
}
