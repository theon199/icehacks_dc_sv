import { makeRecipe } from '@/domain/recommend/fixtures/makeRecipe';
import { ANSWERED_PREFERENCES } from '@/domain/recommend/fixtures/prefs';

import { mealsFromPantry } from './pantryMeals';

const now = Date.parse('2026-11-11T12:00:00Z');

const omelette = makeRecipe({ id: 'r:omelette', coreIngredientIds: ['egg', 'spinach'] });
const frittata = makeRecipe({
  id: 'r:frittata',
  coreIngredientIds: ['egg', 'spinach', 'potato', 'onion'],
});
const salad = makeRecipe({ id: 'r:salad', coreIngredientIds: ['spinach', 'feta', 'walnut'] });
const curry = makeRecipe({ id: 'r:curry', coreIngredientIds: ['chickpea', 'tomato', 'onion'] });
const eggFried = makeRecipe({
  id: 'r:egg-fried',
  coreIngredientIds: ['egg', 'rice'],
  allergens: { egg: 'contains' },
});
const noCore = makeRecipe({ id: 'r:toast', coreIngredientIds: [] });

const candidates = [omelette, frittata, salad, curry, eggFried, noCore];

describe('meals you can make', () => {
  it('ranks by pantry coverage, then by use of the photographed items', () => {
    const meals = mealsFromPantry({
      candidates,
      prefs: ANSWERED_PREFERENCES,
      pantryIds: new Set(['egg', 'spinach', 'rice', 'onion', 'feta']),
      snappedIds: new Set(['egg', 'spinach']),
      now,
    });
    expect(meals.map((meal) => [meal.recipe.id, meal.owned, meal.total])).toEqual([
      ['r:omelette', 2, 2],
      ['r:egg-fried', 2, 2],
      ['r:frittata', 3, 4],
      ['r:salad', 2, 3],
      ['r:curry', 1, 3],
    ]);
    // Same coverage: the omelette uses both snapped items, the fried rice only one.
    expect(meals.slice(0, 2).map((meal) => meal.usesSnapped)).toEqual([2, 1]);
  });

  it('never suggests a recipe that is unsafe for the person', () => {
    const meals = mealsFromPantry({
      candidates,
      prefs: { ...ANSWERED_PREFERENCES, allergens: ['egg'] },
      pantryIds: new Set(['egg', 'spinach', 'rice']),
      snappedIds: new Set(),
      now,
    });
    expect(meals.map((meal) => meal.recipe.id)).not.toContain('r:egg-fried');
  });

  it('suggests nothing before allergies and diets are answered', () => {
    const meals = mealsFromPantry({
      candidates,
      prefs: { ...ANSWERED_PREFERENCES, allergens: null },
      pantryIds: new Set(['egg', 'spinach']),
      snappedIds: new Set(),
      now,
    });
    expect(meals).toEqual([]);
  });

  it('leaves out recipes that barely use the pantry, and handles an empty pantry', () => {
    const meals = mealsFromPantry({
      candidates,
      prefs: ANSWERED_PREFERENCES,
      pantryIds: new Set(['onion']),
      snappedIds: new Set(),
      now,
    });
    expect(meals.map((meal) => meal.recipe.id)).toEqual(['r:curry']);
    expect(
      mealsFromPantry({
        candidates,
        prefs: ANSWERED_PREFERENCES,
        pantryIds: new Set(),
        snappedIds: new Set(),
        now,
      }),
    ).toEqual([]);
  });
});
