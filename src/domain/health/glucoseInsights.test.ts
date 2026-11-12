import {
  GLUCOSE_INSIGHT_RULES,
  median,
  mergePairs,
  prunePairs,
  summarizeGlucose,
} from './glucoseInsights';
import type { GlucosePair } from './glucosePairing';
import { DAY_MS } from './types';

const NOW = Date.UTC(2026, 10, 30, 12, 0);
let counter = 0;

function pair(recipeRef: string, riseMgdl: number, dayOffset: number): GlucosePair {
  counter += 1;
  const startedAt = NOW - dayOffset * DAY_MS;
  return {
    mealId: `meal-${counter}`,
    recipeRef,
    localDate: new Date(startedAt).toISOString().slice(0, 10),
    startedAt,
    baselineMgdl: 100,
    peakMgdl: 100 + riseMgdl,
    riseMgdl,
    minutesToPeak: 40,
    sampleCount: 24,
  };
}

/** One pair per day for `days` days, cycling through the given dishes. */
function history(days: number, dishes: [string, number][]): GlucosePair[] {
  return Array.from({ length: days }, (_, i) => {
    const [ref, rise] = dishes[i % dishes.length] ?? ['x', 0];
    return pair(ref, rise, i + 1);
  });
}

describe('summarizeGlucose', () => {
  it('reports no data when there are no pairs', () => {
    expect(summarizeGlucose([], NOW)).toEqual({
      status: 'no_data',
      pairCount: 0,
      pairedDays: 0,
      daysRemaining: GLUCOSE_INSIGHT_RULES.minPairedDays,
      overallMedianRiseMgdl: null,
      dishes: [],
    });
  });

  it('keeps collecting until twelve distinct days have pairs', () => {
    const pairs = history(11, [
      ['lentil-soup', 15],
      ['white-rice', 60],
    ]);
    const summary = summarizeGlucose(pairs, NOW);
    expect(summary.status).toBe('collecting');
    expect(summary.pairedDays).toBe(11);
    expect(summary.daysRemaining).toBe(1);
    expect(summary.dishes.every((dish) => !dish.steadier)).toBe(true);
  });

  it('counts days, not pairs, towards the minimum', () => {
    const sameDay = Array.from({ length: 20 }, () => pair('lentil-soup', 15, 1));
    const summary = summarizeGlucose(sameDay, NOW);
    expect(summary.pairedDays).toBe(1);
    expect(summary.status).toBe('collecting');
  });

  it('calls a dish steadier once there is enough data', () => {
    const pairs = history(12, [
      ['lentil-soup', 15],
      ['white-rice', 60],
      ['pasta', 50],
    ]);
    const summary = summarizeGlucose(pairs, NOW);
    expect(summary.status).toBe('ready');
    expect(summary.overallMedianRiseMgdl).toBe(50);
    expect(summary.dishes).toEqual([
      { recipeRef: 'lentil-soup', pairCount: 4, medianRiseMgdl: 15, steadier: true },
      { recipeRef: 'pasta', pairCount: 4, medianRiseMgdl: 50, steadier: false },
      { recipeRef: 'white-rice', pairCount: 4, medianRiseMgdl: 60, steadier: false },
    ]);
  });

  it('leaves out dishes with fewer than three pairs', () => {
    const pairs = [
      ...history(12, [
        ['white-rice', 60],
        ['pasta', 50],
      ]),
      pair('salad', 5, 2),
      pair('salad', 5, 3),
    ];
    const summary = summarizeGlucose(pairs, NOW);
    expect(summary.dishes.map((dish) => dish.recipeRef)).not.toContain('salad');
  });

  it('does not label a dish when the difference is too small to matter', () => {
    // Overall median 12; 8 is below 75 % of it but only 4 mg/dL lower.
    const pairs = history(12, [
      ['broth', 8],
      ['toast', 12],
      ['oats', 14],
    ]);
    const summary = summarizeGlucose(pairs, NOW);
    expect(summary.status).toBe('ready');
    expect(summary.dishes.some((dish) => dish.steadier)).toBe(false);
  });

  it('ignores pairs past retention', () => {
    const old = pair('lentil-soup', 15, 200);
    const summary = summarizeGlucose([old], NOW);
    expect(summary.status).toBe('no_data');
  });
});

describe('prunePairs', () => {
  it('keeps one pair per meal and drops future and expired ones', () => {
    const a = pair('x', 10, 1);
    const updated = { ...a, riseMgdl: 12 };
    const future = pair('x', 10, -1);
    const expired = pair('x', 10, 181);
    expect(prunePairs([a, future, expired, updated], NOW)).toEqual([updated]);
  });
});

describe('mergePairs', () => {
  const from = NOW - 7 * DAY_MS;

  it('replaces everything from the re-evaluation start and keeps older history', () => {
    const kept = pair('x', 10, 20);
    const repaired = pair('y', 30, 2);
    const fresh = { ...repaired, riseMgdl: 12 };
    const merged = mergePairs({
      stored: [kept, repaired],
      fresh: [fresh],
      reevaluatedFrom: from,
      now: NOW,
    });
    expect(merged).toEqual([kept, fresh]);
  });

  it('drops the stored pair of a meal that is gone from the cook log', () => {
    const older = pair('x', 10, 20);
    const deleted = pair('y', 30, 2);
    const merged = mergePairs({
      stored: [older, deleted],
      fresh: [],
      reevaluatedFrom: from,
      now: NOW,
    });
    expect(merged).toEqual([older]);
  });

  it('drops the stored pair of a meal that no longer pairs cleanly', () => {
    const noLongerClean = pair('y', 30, 3);
    const stillClean = pair('z', 20, 1);
    const merged = mergePairs({
      stored: [noLongerClean, stillClean],
      fresh: [stillClean],
      reevaluatedFrom: from,
      now: NOW,
    });
    expect(merged).toEqual([stillClean]);
  });

  it('keeps only older pairs whose meal is still logged when the log was checked', () => {
    const logged = pair('x', 10, 20);
    const removed = pair('x', 12, 40);
    const merged = mergePairs({
      stored: [removed, logged],
      fresh: [],
      reevaluatedFrom: from,
      olderMealIds: new Set([logged.mealId]),
      now: NOW,
    });
    expect(merged).toEqual([logged]);
  });

  it('ignores fresh pairs from before the re-evaluation start', () => {
    const early = pair('x', 10, 9);
    expect(mergePairs({ stored: [], fresh: [early], reevaluatedFrom: from, now: NOW })).toEqual([]);
  });

  it('stops deleted meals from counting towards paired days and dish labels', () => {
    // Twelve older days, one pair each; soup has one of them.
    const older = Array.from({ length: 12 }, (_, i) =>
      pair(i === 0 ? 'soup' : i % 2 === 0 ? 'pasta' : 'rice', i === 0 ? 10 : 50, 8 + i),
    );
    // Two recent soup meals that were later deleted from the cook log.
    const deleted = [pair('soup', 10, 2), pair('soup', 10, 3)];
    const stored = [...older, ...deleted];
    const before = summarizeGlucose(stored, NOW);
    expect(before.dishes.find((dish) => dish.recipeRef === 'soup')).toMatchObject({
      steadier: true,
    });

    const after = summarizeGlucose(
      mergePairs({ stored, fresh: [], reevaluatedFrom: from, now: NOW }),
      NOW,
    );
    expect(after.pairCount).toBe(12);
    expect(after.pairedDays).toBe(12);
    expect(after.dishes.find((dish) => dish.recipeRef === 'soup')).toBeUndefined();
  });
});

describe('median', () => {
  it.each([
    [[], null],
    [[3], 3],
    [[5, 1, 3], 3],
    [[4, 1, 3, 2], 2.5],
  ])('median of %j is %s', (values, expected) => {
    expect(median(values)).toBe(expected);
  });
});
