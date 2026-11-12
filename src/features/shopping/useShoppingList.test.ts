import { setSlot, type PlanWeek } from '@/stores/mealPlan';

import { plannedMealsInRange } from './planRange';
import { portionedMeals } from './useShoppingList';

const at = '2026-11-11T10:00:00.000Z';
const WEEK = '2026-11-09';
const RANGE = { from: '2026-11-09', to: '2026-11-15' };

function plannedWeek(): Record<string, PlanWeek> {
  let weeks: Record<string, PlanWeek> = {};
  // Planned at half size by a small-meals plan.
  weeks = setSlot(weeks, WEEK, '0-dinner', { recipeId: 'half', servings: 2, portion: 0.5 }, at);
  // Planned at full size by a plan made with small meals turned off.
  weeks = setSlot(weeks, WEEK, '1-dinner', { recipeId: 'whole', servings: 2, portion: 1 }, at);
  // Added by hand: no portion of its own.
  weeks = setSlot(weeks, WEEK, '2-lunch', { recipeId: 'by-hand', servings: 3 }, at);
  weeks = setSlot(weeks, WEEK, '2-snack', { recipeId: 'snack', servings: 2 }, at);
  return weeks;
}

function servingsById(weeks: Record<string, PlanWeek>, smallAppetite: boolean) {
  const meals = portionedMeals(plannedMealsInRange(weeks, RANGE), weeks, smallAppetite);
  return Object.fromEntries(meals.map((meal) => [meal.recipeId, meal.servings]));
}

describe('portionedMeals', () => {
  it('buys for the portion each meal was planned at', () => {
    expect(servingsById(plannedWeek(), false)).toEqual({
      half: 1,
      whole: 2,
      'by-hand': 3,
      snack: 2,
    });
  });

  it('halves meals planned without a portion in small appetite mode, keeping snacks whole', () => {
    expect(servingsById(plannedWeek(), true)).toEqual({
      half: 1,
      // A plan saved at full size stays full size whatever the setting says now.
      whole: 2,
      'by-hand': 1.5,
      snack: 2,
    });
  });

  it('leaves full-size meals untouched', () => {
    const weeks = plannedWeek();
    const meals = plannedMealsInRange(weeks, RANGE);
    const out = portionedMeals(meals, weeks, false);
    expect(out[1]).toBe(meals[1]);
  });
});
