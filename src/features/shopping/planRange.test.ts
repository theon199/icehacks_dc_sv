import { setSlot, type PlanWeek } from '@/stores/mealPlan';

import { datesIn, plannedMealsInRange, rangeFor, rangeLabel, recipeIdsOf } from './planRange';

const at = '2026-11-01T00:00:00.000Z';
// Wednesday 11 November 2026.
const today = '2026-11-11';

function plan(): Readonly<Record<string, PlanWeek>> {
  let weeks: Readonly<Record<string, PlanWeek>> = {};
  // Week of Monday 9 November.
  weeks = setSlot(weeks, '2026-11-09', '0-dinner', { recipeId: 'monday', servings: 2 }, at);
  weeks = setSlot(weeks, '2026-11-09', '2-lunch', { recipeId: 'wed-lunch', servings: 1 }, at);
  weeks = setSlot(weeks, '2026-11-09', '2-breakfast', { recipeId: 'wed-bf', servings: 1 }, at);
  weeks = setSlot(weeks, '2026-11-09', '6-dinner', { recipeId: 'sunday', servings: 4 }, at);
  // Week of Monday 16 November.
  weeks = setSlot(weeks, '2026-11-16', '1-dinner', { recipeId: 'next-tue', servings: 2 }, at);
  weeks = setSlot(weeks, '2026-11-16', '6-snack', { recipeId: 'next-sun', servings: 2 }, at);
  return weeks;
}

describe('date ranges', () => {
  it('covers today through Sunday for the rest of this week', () => {
    expect(rangeFor('thisWeek', today)).toEqual({ from: '2026-11-11', to: '2026-11-15' });
  });

  it('covers seven days from today', () => {
    expect(rangeFor('next7', today)).toEqual({ from: '2026-11-11', to: '2026-11-17' });
  });

  it('covers the whole of next week', () => {
    expect(rangeFor('nextWeek', today)).toEqual({ from: '2026-11-16', to: '2026-11-22' });
  });

  it('lists each day once, across a month end', () => {
    expect(datesIn({ from: '2026-11-29', to: '2026-12-02' })).toEqual([
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
    ]);
  });

  it('labels the range for the header', () => {
    expect(rangeLabel({ from: '2026-11-11', to: '2026-11-15' })).toBe('Wed, Nov 11 – Sun, Nov 15');
    expect(rangeLabel({ from: '2026-11-11', to: '2026-11-11' })).toBe('Wed, Nov 11');
  });
});

describe('planned meals in a range', () => {
  it('skips days before the range and orders by day then meal', () => {
    const meals = plannedMealsInRange(plan(), rangeFor('thisWeek', today));
    expect(meals.map((m) => [m.date, m.meal, m.recipeId, m.servings])).toEqual([
      ['2026-11-11', 'breakfast', 'wed-bf', 1],
      ['2026-11-11', 'lunch', 'wed-lunch', 1],
      ['2026-11-15', 'dinner', 'sunday', 4],
    ]);
  });

  it('crosses into the next planned week', () => {
    const meals = plannedMealsInRange(plan(), rangeFor('next7', today));
    expect(recipeIdsOf(meals)).toEqual(['wed-bf', 'wed-lunch', 'sunday', 'next-tue']);
  });

  it('is empty when nothing is planned', () => {
    expect(plannedMealsInRange({}, rangeFor('nextWeek', today))).toEqual([]);
  });

  it('lists a recipe planned on several days once in the id list', () => {
    let weeks = plan();
    weeks = setSlot(weeks, '2026-11-09', '3-dinner', { recipeId: 'sunday', servings: 2 }, at);
    const meals = plannedMealsInRange(weeks, rangeFor('thisWeek', today));
    expect(meals.filter((m) => m.recipeId === 'sunday')).toHaveLength(2);
    expect(recipeIdsOf(meals).filter((id) => id === 'sunday')).toHaveLength(1);
  });
});
