import { daysUntilCooler, HEAT_SHADE_THRESHOLDS, heatShade, regionHeat } from './heat';

const NOW = new Date('2026-11-14T12:00:00Z');
const DAY_MS = 86_400_000;

/** An ISO time `days` before NOW. */
function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

describe('regionHeat', () => {
  it('is 0 with no check-ins', () => {
    expect(regionHeat([], NOW)).toBe(0);
  });

  it('halves every 21 days', () => {
    expect(regionHeat([daysAgo(0)], NOW)).toBe(1);
    expect(regionHeat([daysAgo(21)], NOW)).toBeCloseTo(0.5);
    expect(regionHeat([daysAgo(42)], NOW)).toBeCloseTo(0.25);
    expect(regionHeat([daysAgo(10.5)], NOW)).toBeCloseTo(Math.SQRT1_2);
  });

  it('sums the check-ins', () => {
    expect(regionHeat([daysAgo(0), daysAgo(21), daysAgo(42)], NOW)).toBeCloseTo(1.75);
  });

  it('counts a future time as now and ignores times that do not parse', () => {
    expect(regionHeat([daysAgo(-3)], NOW)).toBe(1);
    expect(regionHeat(['not a time', daysAgo(0)], NOW)).toBe(1);
  });
});

describe('heatShade', () => {
  it('maps heat onto five shades at the documented bounds', () => {
    expect(HEAT_SHADE_THRESHOLDS).toEqual([0.25, 1.5, 3, 6]);
    expect(heatShade(0)).toBe(0);
    expect(heatShade(0.2499)).toBe(0);
    expect(heatShade(0.25)).toBe(1);
    expect(heatShade(1)).toBe(1);
    expect(heatShade(1.5)).toBe(2);
    expect(heatShade(2.99)).toBe(2);
    expect(heatShade(3)).toBe(3);
    expect(heatShade(6)).toBe(4);
    expect(heatShade(100)).toBe(4);
  });

  it('treats nonsense heat as cold', () => {
    expect(heatShade(Number.NaN)).toBe(0);
    expect(heatShade(-1)).toBe(0);
  });
});

describe('daysUntilCooler', () => {
  it('is null when the region is already cold', () => {
    expect(daysUntilCooler([], NOW)).toBeNull();
    expect(daysUntilCooler([daysAgo(60)], NOW)).toBeNull();
  });

  it('counts whole days until the heat falls below the current shade', () => {
    // One visit today: heat 1, shade 1 until it falls below 0.25 after 42 days. Day 42 lands on
    // 0.25 exactly, which is still shade 1, so it cools on day 43.
    expect(daysUntilCooler([daysAgo(0)], NOW)).toBe(43);
    // Ten and a half days in, it reaches 0.25 after 31.5 more days, so 32.
    expect(daysUntilCooler([daysAgo(10.5)], NOW)).toBe(32);
  });

  it('rounds a drop due within hours up to 1 day', () => {
    expect(daysUntilCooler([daysAgo(41.9)], NOW)).toBe(1);
  });

  it('agrees with heatShade on both sides of the answer', () => {
    const times = [daysAgo(1), daysAgo(2), daysAgo(3.5), daysAgo(9), daysAgo(30)];
    const shade = heatShade(regionHeat(times, NOW));
    expect(shade).toBe(3);
    const days = daysUntilCooler(times, NOW);
    expect(days).not.toBeNull();
    const at = (d: number) => heatShade(regionHeat(times, new Date(NOW.getTime() + d * DAY_MS)));
    expect(at(days! - 1)).toBe(shade);
    expect(at(days!)).toBe(shade - 1);
  });

  it('treats a future check-in as happening now', () => {
    expect(daysUntilCooler([daysAgo(-2)], NOW)).toBe(daysUntilCooler([daysAgo(0)], NOW));
  });

  it('is null for an invalid now', () => {
    expect(daysUntilCooler([daysAgo(0)], new Date(Number.NaN))).toBeNull();
  });
});
