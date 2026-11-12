import {
  DAY_CONTEXT_RULES,
  INTENSITY_WEIGHTS,
  NO_DAY_HINTS,
  activityLevelFor,
  computeDayContext,
  isDayContextActive,
  mergedMinutes,
  rankingHintsFor,
  suggestionsFor,
} from './dayContext';
import { DAY_MS, HOUR_MS, MINUTE_MS, WORKOUT_KINDS, type WorkoutKind } from './types';

const NOW = Date.UTC(2026, 10, 11, 18, 0);
const minutesAgo = (minutes: number) => NOW - minutes * MINUTE_MS;

function workout(kind: WorkoutKind, endedMinutesAgo: number, minutes: number) {
  const end = minutesAgo(endedMinutesAgo);
  return { kind, start: end - minutes * MINUTE_MS, end };
}

function night(hours: number, endedHoursAgo = 10) {
  const end = NOW - endedHoursAgo * HOUR_MS;
  return { start: end - hours * HOUR_MS, end };
}

describe('computeDayContext', () => {
  it('is a rest day with no suggestions when nothing was recorded', () => {
    const context = computeDayContext({ workouts: [], sleep: [], now: NOW });
    expect(context).toEqual({
      computedAt: NOW,
      expiresAt: NOW + DAY_MS,
      activity: 'rest',
      activityLoad: 0,
      workoutMinutes: 0,
      sleepMinutes: null,
      shortSleep: false,
      suggestions: [],
    });
  });

  it('weights workout minutes by type', () => {
    const run = computeDayContext({ workouts: [workout('running', 60, 30)], sleep: [], now: NOW });
    const walk = computeDayContext({ workouts: [workout('walking', 60, 30)], sleep: [], now: NOW });
    expect(run.activityLoad).toBe(30 * INTENSITY_WEIGHTS.running);
    expect(walk.activityLoad).toBe(30 * INTENSITY_WEIGHTS.walking);
    expect(run.activity).toBe('active');
    expect(walk.activity).toBe('light');
  });

  it('adds several workouts together', () => {
    const context = computeDayContext({
      workouts: [workout('strength', 300, 40), workout('intervals', 60, 20)],
      sleep: [],
      now: NOW,
    });
    expect(context.workoutMinutes).toBe(60);
    expect(context.activityLoad).toBe(40 + 20 * INTENSITY_WEIGHTS.intervals);
    expect(context.activity).toBe('very_active');
    expect(context.suggestions).toEqual(['more_protein', 'refuel_carbs']);
  });

  it('only counts the part of a workout inside the last 24 hours', () => {
    const end = NOW - DAY_MS + 15 * MINUTE_MS;
    const context = computeDayContext({
      workouts: [{ kind: 'strength', start: end - 60 * MINUTE_MS, end }],
      sleep: [],
      now: NOW,
    });
    expect(context.workoutMinutes).toBe(15);
  });

  it('ignores workouts that ended more than a day ago or start in the future', () => {
    const context = computeDayContext({
      workouts: [
        workout('running', 25 * 60, 60),
        { kind: 'running', start: NOW + HOUR_MS, end: NOW + 2 * HOUR_MS },
      ],
      sleep: [],
      now: NOW,
    });
    expect(context.workoutMinutes).toBe(0);
    expect(context.activity).toBe('rest');
  });

  it('caps a workout that was left recording', () => {
    const context = computeDayContext({
      workouts: [workout('walking', 0, 10 * 60)],
      sleep: [],
      now: NOW,
    });
    expect(context.workoutMinutes).toBe(DAY_CONTEXT_RULES.maxWorkoutMinutes);
  });

  it('flags a short night under six hours and suggests a lighter, earlier dinner', () => {
    const context = computeDayContext({ workouts: [], sleep: [night(5.5)], now: NOW });
    expect(context.sleepMinutes).toBe(330);
    expect(context.shortSleep).toBe(true);
    expect(context.suggestions).toEqual(['lighter_dinner', 'earlier_dinner']);
  });

  it('treats exactly six hours as enough sleep', () => {
    const context = computeDayContext({ workouts: [], sleep: [night(6)], now: NOW });
    expect(context.shortSleep).toBe(false);
  });

  it('merges overlapping sleep recorded by two devices', () => {
    const a = night(7);
    const b = { start: a.start + HOUR_MS, end: a.end + 30 * MINUTE_MS };
    const context = computeDayContext({ workouts: [], sleep: [a, b], now: NOW });
    expect(context.sleepMinutes).toBe(7.5 * 60);
  });

  it('combines activity and sleep suggestions', () => {
    const context = computeDayContext({
      workouts: [workout('cycling', 120, 45)],
      sleep: [night(4)],
      now: NOW,
    });
    expect(context.suggestions).toEqual(['more_protein', 'lighter_dinner', 'earlier_dinner']);
  });
});

describe('activityLevelFor', () => {
  it.each([
    [0, 'rest'],
    [9.9, 'rest'],
    [10, 'light'],
    [29.9, 'light'],
    [30, 'active'],
    [59.9, 'active'],
    [60, 'very_active'],
  ] as const)('load %d is %s', (load, level) => {
    expect(activityLevelFor(load)).toBe(level);
  });
});

describe('INTENSITY_WEIGHTS', () => {
  it('has a positive weight for every workout kind', () => {
    for (const kind of WORKOUT_KINDS) expect(INTENSITY_WEIGHTS[kind]).toBeGreaterThan(0);
  });
});

describe('suggestionsFor', () => {
  it('suggests nothing on a light, well-rested day', () => {
    expect(suggestionsFor('light', false)).toEqual([]);
  });
});

describe('mergedMinutes', () => {
  it('clips to the window and skips empty intervals', () => {
    expect(
      mergedMinutes(
        [
          { start: 0, end: 30 * MINUTE_MS },
          { start: 50 * MINUTE_MS, end: 50 * MINUTE_MS },
          { start: 90 * MINUTE_MS, end: 200 * MINUTE_MS },
        ],
        10 * MINUTE_MS,
        120 * MINUTE_MS,
      ),
    ).toBe(20 + 30);
  });
});

describe('expiry', () => {
  const context = computeDayContext({
    workouts: [workout('running', 30, 60)],
    sleep: [],
    now: NOW,
  });

  it('applies until 24 hours after it was computed', () => {
    expect(isDayContextActive(context, NOW)).toBe(true);
    expect(isDayContextActive(context, NOW + DAY_MS - 1)).toBe(true);
    expect(isDayContextActive(context, NOW + DAY_MS)).toBe(false);
  });

  it('does not apply when the clock is earlier than the computation', () => {
    expect(isDayContextActive(context, NOW - 1)).toBe(false);
  });

  it('is inactive when there is no context', () => {
    expect(isDayContextActive(null, NOW)).toBe(false);
  });
});

describe('rankingHintsFor', () => {
  it('leans fully towards protein on a very active day', () => {
    const context = computeDayContext({
      workouts: [workout('running', 30, 60)],
      sleep: [],
      now: NOW,
    });
    expect(rankingHintsFor(context, NOW)).toEqual({ protein: 1, lighter: 0 });
  });

  it('leans towards lighter dishes after a short night', () => {
    const context = computeDayContext({ workouts: [], sleep: [night(4)], now: NOW });
    expect(rankingHintsFor(context, NOW)).toEqual({ protein: 0, lighter: 0.6 });
  });

  it('returns no hints once the context has expired', () => {
    const context = computeDayContext({
      workouts: [workout('running', 30, 60)],
      sleep: [night(4)],
      now: NOW,
    });
    expect(rankingHintsFor(context, NOW + DAY_MS)).toBe(NO_DAY_HINTS);
    expect(rankingHintsFor(null, NOW)).toBe(NO_DAY_HINTS);
  });
});
