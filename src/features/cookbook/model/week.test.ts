import type { PlanWeek } from '@/stores';

import {
  defaultSlotFor,
  initialDay,
  locateDate,
  mealsForDay,
  mealsPerDay,
  remainingDays,
  resolveWeekParam,
  storedPortion,
  toSlotWrites,
  toWeekPlan,
  weekCostRecipes,
  weekDays,
  weekOffset,
  weekRangeLabel,
  weekTitle,
} from './week';

// Wednesday 11 November 2026; its week starts Monday 9 November.
const TODAY = '2026-11-11';
const WEEK = '2026-11-09';

describe('week labels', () => {
  it('names nearby weeks and shows ranges further out', () => {
    expect(weekTitle(WEEK, TODAY)).toBe('This week');
    expect(weekTitle('2026-11-16', TODAY)).toBe('Next week');
    expect(weekTitle('2026-11-02', TODAY)).toBe('Last week');
    expect(weekTitle('2026-11-23', TODAY)).toBe('Nov 23 – 29');
  });

  it('spans months in the range label', () => {
    expect(weekRangeLabel(WEEK)).toBe('Nov 9 – 15');
    expect(weekRangeLabel('2026-11-30')).toBe('Nov 30 – Dec 6');
  });

  it('counts weeks from the current one', () => {
    expect(weekOffset(WEEK, TODAY)).toBe(0);
    expect(weekOffset('2026-12-28', TODAY)).toBe(7);
    expect(weekOffset('2026-10-26', TODAY)).toBe(-2);
  });

  it('lists Monday to Sunday with today and past days marked', () => {
    const days = weekDays(WEEK, TODAY);
    expect(days.map((d) => d.short)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(days[2]).toMatchObject({
      date: TODAY,
      isToday: true,
      dayOfMonth: '11',
      weekday: 'Wednesday',
      long: 'Wednesday, November 11',
    });
    expect(days.filter((d) => d.isPast).map((d) => d.day)).toEqual([0, 1]);
  });

  it('opens on today in the current week and on Monday elsewhere', () => {
    expect(initialDay(WEEK, TODAY)).toBe(2);
    expect(initialDay('2026-11-16', TODAY)).toBe(0);
  });
});

describe('remaining days', () => {
  it('starts from today in the current week', () => {
    expect(remainingDays(WEEK, TODAY)).toEqual([2, 3, 4, 5, 6]);
  });

  it('covers all of a future week and none of a past one', () => {
    expect(remainingDays('2026-11-16', TODAY)).toHaveLength(7);
    expect(remainingDays('2026-11-02', TODAY)).toEqual([]);
  });
});

describe('store and planner shapes', () => {
  const week: PlanWeek = {
    weekStart: WEEK,
    archivedAt: null,
    slots: {
      '0-dinner': { recipeId: 'a', servings: 2, addedAt: 'x' },
      '0-lunch': { recipeId: 'b', servings: 1, addedAt: 'x' },
      '4-breakfast': { recipeId: 'c', servings: 3, addedAt: 'x' },
    },
  };

  it('reads a stored week as planner cells', () => {
    const plan = toWeekPlan(week, WEEK, 0.5);
    expect(plan.cells['0:dinner']).toEqual({ recipeId: 'a', servings: 2, portion: 0.5 });
    expect(plan.cells['4:breakfast']?.recipeId).toBe('c');
    expect(toWeekPlan(undefined, WEEK).cells).toEqual({});
  });

  it('keeps the portion a meal was planned at when reading a week', () => {
    const planned: PlanWeek = {
      ...week,
      slots: { '1-dinner': { recipeId: 'd', servings: 2, addedAt: 'x', portion: 0.5 } },
    };
    expect(toWeekPlan(planned, WEEK, 1).cells['1:dinner']?.portion).toBe(0.5);
  });

  it('turns planner assignments into whole-serving slot writes with their portion', () => {
    expect(
      toSlotWrites([
        { day: 3, slot: 'lunch', meal: { recipeId: 'r', servings: 2.4, portion: 1 } },
        { day: 6, slot: 'snack', meal: { recipeId: 's', servings: 0.5, portion: 0.5 } },
      ]),
    ).toEqual([
      { slot: '3-lunch', recipeId: 'r', servings: 2, portion: 1 },
      { slot: '6-snack', recipeId: 's', servings: 1, portion: 0.5 },
    ]);
  });

  it('keeps stored portions within the range the planner store accepts', () => {
    expect(storedPortion(0.5)).toBe(0.5);
    expect(storedPortion(1 / 3)).toBe(0.33);
    expect(storedPortion(0.1)).toBe(0.25);
    expect(storedPortion(9)).toBe(2);
    expect(storedPortion(Number.NaN)).toBe(1);
    expect(storedPortion(0)).toBe(1);
  });

  it('costs every meal of the week at its servings times its portion', () => {
    const slots: PlanWeek['slots'] = {
      '2-dinner': { recipeId: 'a', servings: 2, addedAt: 'x', portion: 0.5 },
      '0-lunch': { recipeId: 'a', servings: 3, addedAt: 'x' },
      '0-snack': { recipeId: 's', servings: 2, addedAt: 'x' },
      '0-breakfast': { recipeId: 'b', servings: 4, addedAt: 'x', portion: 1 },
    };
    expect(weekCostRecipes(slots, false)).toEqual([
      { recipeId: 'b', servings: 4 },
      { recipeId: 'a', servings: 3 },
      { recipeId: 's', servings: 2 },
      { recipeId: 'a', servings: 1 },
    ]);
    // Meals planned without a portion follow small appetite mode; snacks and chosen portions don't.
    expect(weekCostRecipes(slots, true)).toEqual([
      { recipeId: 'b', servings: 4 },
      { recipeId: 'a', servings: 1.5 },
      { recipeId: 's', servings: 2 },
      { recipeId: 'a', servings: 1 },
    ]);
    expect(weekCostRecipes({}, false)).toEqual([]);
  });

  it('lists a day in slot order and counts meals per day', () => {
    expect(mealsForDay(week.slots, 0).map((m) => [m.slot, m.entry?.recipeId])).toEqual([
      ['breakfast', undefined],
      ['lunch', 'b'],
      ['dinner', 'a'],
      ['snack', undefined],
    ]);
    expect(mealsPerDay(week.slots)).toEqual([2, 0, 0, 0, 1, 0, 0]);
  });
});

describe('route and slot defaults', () => {
  it('accepts only a Monday as a week parameter', () => {
    expect(resolveWeekParam('2026-11-16', TODAY)).toBe('2026-11-16');
    expect(resolveWeekParam('2026-11-17', TODAY)).toBe(WEEK);
    expect(resolveWeekParam('nonsense', TODAY)).toBe(WEEK);
    expect(resolveWeekParam(undefined, TODAY)).toBe(WEEK);
  });

  it('places a date in its planner week', () => {
    expect(locateDate('2026-11-15')).toEqual({ week: WEEK, day: 6 });
    expect(locateDate('2026-11-16')).toEqual({ week: '2026-11-16', day: 0 });
  });

  it('suggests a slot from the course', () => {
    expect(defaultSlotFor('breakfast')).toBe('breakfast');
    expect(defaultSlotFor('snack')).toBe('snack');
    expect(defaultSlotFor('dessert')).toBe('snack');
    expect(defaultSlotFor('soup')).toBe('dinner');
  });
});
