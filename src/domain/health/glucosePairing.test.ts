import { GLUCOSE_PAIRING_RULES, pairMeal, pairMeals, prepareReadings } from './glucosePairing';
import { HOUR_MS, MINUTE_MS, type CookedMeal, type GlucoseReading } from './types';

const START = Date.UTC(2026, 10, 10, 18, 30);
const LATER = START + 6 * HOUR_MS;
const at = (minutes: number) => START + minutes * MINUTE_MS;

const meal = (overrides: Partial<CookedMeal> = {}): CookedMeal => ({
  id: 'meal-1',
  recipeRef: 'mealdb:1',
  startedAt: START,
  localDate: '2026-11-10',
  ...overrides,
});

/** Readings every `step` minutes from `from` to `to` (inclusive), following `shape`. */
function series(from: number, to: number, step: number, shape: (m: number) => number) {
  const readings: GlucoseReading[] = [];
  for (let m = from; m <= to; m += step) readings.push({ at: at(m), mgdl: shape(m) });
  return readings;
}

/** A gentle hump: 100 at the start, peaking at 140 around 45 minutes. */
const hump = (m: number) => (m <= 0 ? 100 : 100 + Math.max(0, 40 - Math.abs(m - 45)));

function evaluate(
  readings: GlucoseReading[],
  options: { meals?: CookedMeal[]; workouts?: { start: number; end: number }[]; now?: number } = {},
) {
  const target = meal();
  return pairMeal(target, {
    readings: prepareReadings(readings),
    meals: options.meals ?? [target],
    workouts: (options.workouts ?? []).map((w) => ({ ...w, kind: 'running' as const })),
    now: options.now ?? LATER,
  });
}

describe('pairMeal', () => {
  it('pairs a clean five-minute sensor window', () => {
    const outcome = evaluate(series(-5, 120, 5, hump));
    expect(outcome).toEqual({
      ok: true,
      pair: {
        mealId: 'meal-1',
        recipeRef: 'mealdb:1',
        localDate: '2026-11-10',
        startedAt: START,
        baselineMgdl: 100,
        peakMgdl: 140,
        riseMgdl: 40,
        minutesToPeak: 45,
        sampleCount: 25,
      },
    });
  });

  it('pairs a fifteen-minute sensor that just meets the sample minimum', () => {
    // Baseline at the start plus readings to 75 minutes is 6 samples; the last gap to the window
    // end is exactly 45 minutes, which is allowed.
    const outcome = evaluate(series(0, 75, 15, hump));
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.pair.sampleCount).toBe(GLUCOSE_PAIRING_RULES.minSamples);
  });

  it('waits until the two-hour window has closed', () => {
    const outcome = evaluate(series(-5, 60, 5, hump), { now: at(119) });
    expect(outcome).toEqual({ ok: false, mealId: 'meal-1', reason: 'window_open' });
    expect(evaluate(series(-5, 120, 5, hump), { now: at(120) }).ok).toBe(true);
  });

  describe('baseline', () => {
    it('accepts a reading exactly ten minutes before the start', () => {
      const readings = [{ at: at(-10), mgdl: 95 }, ...series(5, 120, 5, hump)];
      const outcome = evaluate(readings);
      expect(outcome.ok && outcome.pair.baselineMgdl).toBe(95);
    });

    it('rejects a window whose last reading before the start is older than ten minutes', () => {
      const readings = [{ at: at(-11), mgdl: 95 }, ...series(5, 120, 5, hump)];
      expect(evaluate(readings)).toMatchObject({ ok: false, reason: 'no_baseline' });
    });

    it('rejects a window that only has readings after the start', () => {
      expect(evaluate(series(1, 120, 5, hump))).toMatchObject({ ok: false, reason: 'no_baseline' });
    });

    it('uses the reading closest to the start', () => {
      const readings = [
        { at: at(-9), mgdl: 90 },
        { at: at(-2), mgdl: 104 },
        ...series(5, 120, 5, hump),
      ];
      const outcome = evaluate(readings);
      expect(outcome.ok && outcome.pair.baselineMgdl).toBe(104);
    });
  });

  it('rejects windows with fewer than six samples', () => {
    const readings = [
      { at: at(0), mgdl: 100 },
      { at: at(40), mgdl: 130 },
      { at: at(80), mgdl: 120 },
      { at: at(110), mgdl: 105 },
    ];
    expect(evaluate(readings)).toMatchObject({ ok: false, reason: 'too_few_samples' });
  });

  describe('gaps', () => {
    it('rejects a gap longer than 45 minutes between readings', () => {
      const readings = [...series(0, 30, 5, hump), ...series(80, 120, 5, hump)];
      expect(evaluate(readings)).toMatchObject({ ok: false, reason: 'gap_too_long' });
    });

    it('accepts a gap of exactly 45 minutes', () => {
      const readings = [...series(0, 30, 5, hump), ...series(75, 120, 5, hump)];
      expect(evaluate(readings).ok).toBe(true);
    });

    it('rejects readings that stop well before the window ends', () => {
      expect(evaluate(series(0, 70, 5, hump))).toMatchObject({
        ok: false,
        reason: 'gap_too_long',
      });
    });
  });

  describe('confounders', () => {
    it('excludes a meal with another meal within two hours before', () => {
      const other = meal({ id: 'snack', startedAt: at(-120) });
      expect(evaluate(series(-5, 120, 5, hump), { meals: [meal(), other] })).toMatchObject({
        ok: false,
        reason: 'overlapping_meal',
      });
    });

    it('excludes a meal with another meal within two hours after', () => {
      const other = meal({ id: 'dessert', startedAt: at(90) });
      expect(evaluate(series(-5, 120, 5, hump), { meals: [meal(), other] })).toMatchObject({
        ok: false,
        reason: 'overlapping_meal',
      });
    });

    it('keeps a meal when the other one is more than two hours away', () => {
      const other = meal({ id: 'lunch', startedAt: at(-121) });
      expect(evaluate(series(-5, 120, 5, hump), { meals: [meal(), other] }).ok).toBe(true);
    });

    it('excludes a meal when a workout overlaps the window', () => {
      const outcome = evaluate(series(-5, 120, 5, hump), {
        workouts: [{ start: at(100), end: at(140) }],
      });
      expect(outcome).toMatchObject({ ok: false, reason: 'workout_in_window' });
    });

    it('excludes a meal eaten during a workout', () => {
      const outcome = evaluate(series(-5, 120, 5, hump), {
        workouts: [{ start: at(-30), end: at(10) }],
      });
      expect(outcome).toMatchObject({ ok: false, reason: 'workout_in_window' });
    });

    it('keeps a meal when the workout ended before it started', () => {
      const outcome = evaluate(series(-5, 120, 5, hump), {
        workouts: [{ start: at(-60), end: at(0) }],
      });
      expect(outcome.ok).toBe(true);
    });
  });

  it('never reports a negative rise', () => {
    const outcome = evaluate(series(0, 120, 5, (m) => 120 - m / 10));
    expect(outcome.ok && outcome.pair.riseMgdl).toBe(0);
    expect(outcome.ok && outcome.pair.minutesToPeak).toBe(0);
  });
});

describe('prepareReadings', () => {
  it('sorts, removes duplicates at the same instant and drops implausible values', () => {
    expect(
      prepareReadings([
        { at: 3, mgdl: 110 },
        { at: 1, mgdl: 100 },
        { at: 1, mgdl: 101 },
        { at: 2, mgdl: 5 },
        { at: 4, mgdl: 900 },
        { at: Number.NaN, mgdl: 100 },
      ]),
    ).toEqual([
      { at: 1, mgdl: 100 },
      { at: 3, mgdl: 110 },
    ]);
  });
});

describe('pairMeals', () => {
  it('splits meals into pairs and exclusions', () => {
    const dinner = meal();
    const nextDay = meal({ id: 'meal-2', startedAt: at(24 * 60), localDate: '2026-11-11' });
    const result = pairMeals({
      meals: [dinner, nextDay],
      readings: series(-5, 120, 5, hump).reverse(),
      workouts: [],
      now: at(30 * 60),
    });
    expect(result.pairs.map((pair) => pair.mealId)).toEqual(['meal-1']);
    expect(result.excluded).toEqual([{ mealId: 'meal-2', reason: 'no_baseline' }]);
  });
});
