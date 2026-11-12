import { dailyTargets } from '@/domain/nutrition';
import { planDays } from '@/domain/plan';
import { defaultPreferences } from '@/stores';

import { candidatePool } from '../__fixtures__/recipes';
import { toDomainPreferences } from '../deps';
import { rankForPlanning, toDayPlanCandidates } from './candidates';
import { dayPlanWrites, nutrientRows, planDayTitle, SHOWN_NUTRIENTS } from './dayPlan';

const prefs = toDomainPreferences({
  ...defaultPreferences,
  allergensAnswered: true,
  onboardedAt: '2026-11-01T00:00:00.000Z',
});
const pool = toDayPlanCandidates(rankForPlanning(candidatePool(), { prefs, now: 0 }));
const targets = dailyTargets();

describe('two-day plan hand-off', () => {
  it('splits a plan that starts on Sunday across two planner weeks', () => {
    const result = planDays({ candidates: pool, targets, days: 2 });
    const writes = dayPlanWrites(result, '2026-11-15', 2);
    expect(writes.map((w) => w.week)).toEqual(['2026-11-09', '2026-11-16']);
    expect(writes[0]!.writes.map((w) => w.slot)).toEqual(['6-breakfast', '6-lunch', '6-dinner']);
    expect(writes[1]!.writes.map((w) => w.slot)).toEqual(['0-breakfast', '0-lunch', '0-dinner']);
    expect(writes.flatMap((w) => w.writes).every((w) => w.servings === 2)).toBe(true);
  });

  it('keeps one snack a day for small-appetite plans', () => {
    const result = planDays({ candidates: pool, targets, days: 2, smallAppetite: true });
    const [week] = dayPlanWrites(result, '2026-11-11', 1);
    const day2 = week!.writes.filter((w) => w.slot.startsWith('2-')).map((w) => w.slot);
    expect(day2.filter((s) => s === '2-snack')).toHaveLength(1);
    expect(new Set(day2).size).toBe(day2.length);
  });
});

describe('nutrient rows', () => {
  it('reads each shown nutrient against its target with a plain status', () => {
    const result = planDays({ candidates: pool, targets, days: 1 });
    const rows = nutrientRows(result.days[0]!, targets);
    expect(rows.map((r) => r.nutrient)).toEqual(SHOWN_NUTRIENTS);
    const sodium = rows.find((r) => r.nutrient === 'sodium_mg')!;
    expect(sodium.noun).toBe('limit');
    expect(sodium.target).toBe(targets.sodium_mg);
    expect(['Within limit', 'Over limit']).toContain(sodium.statusText);
    expect(sodium.good).toBe(sodium.status === 'within');
    const protein = rows.find((r) => r.nutrient === 'protein_g')!;
    expect(protein.noun).toBe('target');
    expect(protein.ratio).toBeCloseTo(protein.value / protein.target);
  });

  it('titles the first two days relative to today', () => {
    expect(planDayTitle(0, 'Wednesday')).toBe('Today');
    expect(planDayTitle(1, 'Thursday')).toBe('Tomorrow');
    expect(planDayTitle(2, 'Friday')).toBe('Friday');
  });
});
