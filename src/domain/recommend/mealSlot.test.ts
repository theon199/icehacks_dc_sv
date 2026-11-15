import { makeRecipe } from './fixtures/makeRecipe';
import { ANSWERED_PREFERENCES } from './fixtures/prefs';
import {
  fitsMealTime,
  MEAL_COURSES,
  mealForTime,
  mealTimeAdjustment,
  rankMealTimes,
  type MealTimeInput,
} from './mealSlot';
import { DEFAULT_PREFERENCES } from '../types/preferences';

/** A local time on an arbitrary day; only the hour and minute matter. */
const at = (hours: number, minutes: number) => new Date(2026, 10, 14, hours, minutes, 0, 0);

const NOW = Date.UTC(2026, 10, 14, 12);
const pantry = new Set(['egg', 'tomato', 'onion', 'paneer', 'pea', 'rice']);
const input = (overrides: Partial<MealTimeInput> = {}): MealTimeInput => ({
  prefs: ANSWERED_PREFERENCES,
  now: NOW,
  pantry,
  ...overrides,
});

describe('mealForTime', () => {
  it.each([
    [4, 0, 'breakfast'],
    [7, 30, 'breakfast'],
    [10, 59, 'breakfast'],
    [11, 0, 'lunch'],
    [13, 15, 'lunch'],
    [15, 59, 'lunch'],
    [16, 0, 'dinner'],
    [19, 40, 'dinner'],
    [23, 59, 'dinner'],
    [0, 0, 'dinner'],
    [3, 59, 'dinner'],
  ] as const)('%i:%i is %s', (hours, minutes, meal) => {
    expect(mealForTime(at(hours, minutes))).toBe(meal);
  });

  it('reads an invalid date as dinner', () => {
    expect(mealForTime(new Date(Number.NaN))).toBe('dinner');
  });
});

describe('fitsMealTime', () => {
  it('keeps breakfast to breakfast dishes', () => {
    expect(fitsMealTime({ course: 'breakfast' }, 'breakfast')).toBe(true);
    expect(fitsMealTime({ course: 'main' }, 'breakfast')).toBe(false);
  });

  it('takes mains, soups and salads for lunch, and mains and soups for dinner', () => {
    for (const course of ['main', 'soup', 'salad'] as const) {
      expect(fitsMealTime({ course }, 'lunch')).toBe(true);
    }
    expect(fitsMealTime({ course: 'salad' }, 'dinner')).toBe(false);
    expect(fitsMealTime({ course: 'soup' }, 'dinner')).toBe(true);
  });

  it('never makes a meal of sides, snacks, desserts or drinks', () => {
    for (const course of ['side', 'snack', 'dessert', 'drink'] as const) {
      expect(MEAL_COURSES).not.toContain(course);
    }
    expect([...MEAL_COURSES].sort()).toEqual(['breakfast', 'main', 'salad', 'soup']);
  });
});

describe('mealTimeAdjustment', () => {
  const recipe = (totalMinutes: number | null, kcal: number | null) =>
    makeRecipe({ totalMinutes, nutrition: { ...makeRecipe().nutrition, kcal } });

  it('leaves breakfast and dinner in coverage order', () => {
    expect(mealTimeAdjustment(recipe(10, 300), 'breakfast')).toBe(0);
    expect(mealTimeAdjustment(recipe(10, 300), 'dinner')).toBe(0);
  });

  it('favours quick and lighter dishes at lunch, with 30 minutes still counting as quick', () => {
    const quickLight = mealTimeAdjustment(recipe(30, 400), 'lunch');
    const slowLight = mealTimeAdjustment(recipe(31, 400), 'lunch');
    const quickHeavy = mealTimeAdjustment(recipe(30, 750), 'lunch');
    expect(quickLight).toBeCloseTo(0.15);
    expect(slowLight).toBeCloseTo(0.05);
    expect(quickHeavy).toBeCloseTo(0.1);
    expect(mealTimeAdjustment(recipe(30, 575), 'lunch')).toBeCloseTo(0.125);
  });

  it('adds nothing for an unknown time or calorie count', () => {
    expect(mealTimeAdjustment(recipe(null, null), 'lunch')).toBe(0);
  });

  it('stays below one missing ingredient on a six-ingredient dish', () => {
    expect(mealTimeAdjustment(recipe(5, 100), 'lunch')).toBeLessThan(1 / 6);
  });
});

describe('rankMealTimes', () => {
  it('sorts each meal by pantry coverage and leaves out what the pantry barely covers', () => {
    const all = makeRecipe({ id: 't:all', coreIngredientIds: ['paneer', 'pea', 'tomato'] });
    const most = makeRecipe({ id: 't:most', coreIngredientIds: ['paneer', 'pea', 'tomato', 'x'] });
    const few = makeRecipe({ id: 't:few', coreIngredientIds: ['paneer', 'x', 'y', 'z'] });
    const picks = rankMealTimes([few, most, all], input());
    expect(picks.dinner.map((pick) => pick.recipe.id)).toEqual(['t:all', 't:most']);
    expect(picks.dinner[1]).toMatchObject({
      ownedIds: ['paneer', 'pea', 'tomato'],
      missingIds: ['x'],
      coverage: 0.75,
    });
  });

  it('puts each recipe under the meals its course belongs to', () => {
    const core = ['egg', 'tomato'];
    const picks = rankMealTimes(
      [
        makeRecipe({ id: 't:eggs', course: 'breakfast', coreIngredientIds: core }),
        makeRecipe({ id: 't:salad', course: 'salad', coreIngredientIds: core }),
        makeRecipe({ id: 't:soup', course: 'soup', coreIngredientIds: core }),
        makeRecipe({ id: 't:cake', course: 'dessert', coreIngredientIds: core }),
      ],
      input(),
    );
    const ids = (meal: keyof typeof picks) => picks[meal].map((pick) => pick.recipe.id).sort();
    expect(ids('breakfast')).toEqual(['t:eggs']);
    expect(ids('lunch')).toEqual(['t:salad', 't:soup']);
    expect(ids('dinner')).toEqual(['t:soup']);
  });

  it('lets lunch prefer the quick light dish where dinner keeps the engine order', () => {
    const core = ['egg', 'tomato', 'onion'];
    const slow = makeRecipe({
      id: 't:a-slow',
      coreIngredientIds: core,
      totalMinutes: 90,
      nutrition: { ...makeRecipe().nutrition, kcal: 900 },
      cuisine: 'italian',
    });
    const quick = makeRecipe({
      id: 't:b-quick',
      coreIngredientIds: core,
      totalMinutes: 20,
      nutrition: { ...makeRecipe().nutrition, kcal: 380 },
    });
    const picks = rankMealTimes([slow, quick], input());
    expect(picks.lunch[0]?.recipe.id).toBe('t:b-quick');
    expect(picks.dinner.map((pick) => pick.score)).toEqual([1, 1]);
  });

  it('never lets the lunch lean beat a dish the fridge fully covers', () => {
    const full = makeRecipe({
      id: 't:full',
      coreIngredientIds: ['egg', 'tomato', 'onion', 'rice', 'pea'],
      totalMinutes: 60,
      nutrition: { ...makeRecipe().nutrition, kcal: 800 },
    });
    const short = makeRecipe({
      id: 't:short',
      coreIngredientIds: ['egg', 'tomato', 'onion', 'rice', 'x'],
      totalMinutes: 10,
      nutrition: { ...makeRecipe().nutrition, kcal: 300 },
    });
    expect(rankMealTimes([short, full], input()).lunch[0]?.recipe.id).toBe('t:full');
  });

  it('drops anything not verified free of a declared allergen (fail-closed)', () => {
    const core = ['egg', 'tomato'];
    const picks = rankMealTimes(
      [
        makeRecipe({ id: 't:free', coreIngredientIds: core }),
        makeRecipe({ id: 't:unknown', coreIngredientIds: core, allergens: { egg: 'unknown' } }),
        makeRecipe({ id: 't:contains', coreIngredientIds: core, allergens: { egg: 'contains' } }),
      ],
      input({ prefs: { ...ANSWERED_PREFERENCES, allergens: ['egg'] } }),
    );
    expect(picks.dinner.map((pick) => pick.recipe.id)).toEqual(['t:free']);
  });

  it('shows nothing until the safety questions are answered', () => {
    const recipe = makeRecipe({ coreIngredientIds: ['egg'] });
    const picks = rankMealTimes([recipe], input({ prefs: DEFAULT_PREFERENCES }));
    expect(picks).toEqual({ breakfast: [], lunch: [], dinner: [] });
  });

  it('keeps one version per dish family and honours the limit', () => {
    const core = ['egg', 'tomato'];
    const picks = rankMealTimes(
      [
        makeRecipe({ id: 't:v1', familyId: 'shakshuka', coreIngredientIds: core }),
        makeRecipe({ id: 't:v2', familyId: 'shakshuka', coreIngredientIds: core }),
        makeRecipe({ id: 't:other', coreIngredientIds: core }),
        makeRecipe({ id: 't:third', coreIngredientIds: core }),
      ],
      input({ limit: 2 }),
    );
    expect(picks.dinner).toHaveLength(2);
    const families = picks.dinner.map((pick) => pick.recipe.familyId);
    expect(new Set(families).size).toBe(2);
  });

  it('skips recipes with no core ingredients and an empty pantry', () => {
    const staplesOnly = makeRecipe({ coreIngredientIds: [] });
    expect(rankMealTimes([staplesOnly], input()).dinner).toEqual([]);
    const recipe = makeRecipe({ coreIngredientIds: ['egg'] });
    expect(rankMealTimes([recipe], input({ pantry: new Set() })).dinner).toEqual([]);
  });

  it('gives the same order whatever order candidates arrive in', () => {
    const recipes = Array.from({ length: 12 }, (_, i) =>
      makeRecipe({
        id: `t:r${i}`,
        coreIngredientIds: i % 2 ? ['egg', 'tomato'] : ['egg', 'tomato', 'x'],
        totalMinutes: 10 + i * 5,
      }),
    );
    const forward = rankMealTimes(recipes, input({ minCoverage: 0.5 }));
    const backward = rankMealTimes([...recipes].reverse(), input({ minCoverage: 0.5 }));
    expect(backward).toEqual(forward);
  });
});
