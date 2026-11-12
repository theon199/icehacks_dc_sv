import type { RecipeCandidate } from '@/lib/catalog';
import { defaultPreferences, useCookLogStore } from '@/stores';

import {
  estimatedMealId,
  ESTIMATED_MEAL_PREFIX,
  logEstimatedMeal,
  toDomainRecipe,
  toSafetyPrefs,
  toUserPreferences,
} from './deps';

jest.mock('./components/SnapAiGate', () => ({ SnapAiGate: () => null }));
jest.mock('expo-crypto', () => ({
  randomUUID: () => (jest.requireActual('crypto') as { randomUUID: () => string }).randomUUID(),
}));

describe('preference bridge', () => {
  it('reads unanswered allergens as "nothing is safe yet"', () => {
    expect(toSafetyPrefs({ ...defaultPreferences, diets: ['vegan'] })).toEqual({
      allergens: null,
      diets: null,
    });
  });

  it('passes answered allergens and diets through', () => {
    const prefs = {
      ...defaultPreferences,
      allergensAnswered: true,
      allergens: ['peanut' as const],
      diets: ['vegetarian' as const],
    };
    expect(toSafetyPrefs(prefs)).toEqual({ allergens: ['peanut'], diets: ['vegetarian'] });
  });

  it('maps goals and time budget into the ranking shape', () => {
    const prefs = toUserPreferences(
      {
        ...defaultPreferences,
        allergensAnswered: true,
        goals: ['steadier_energy', 'more_fiber'],
        maxMinutes: 30,
        effort: null,
      },
      'metric',
    );
    expect(prefs).toMatchObject({
      goals: ['steady_energy', 'more_fiber'],
      timeBudgetMinutes: 30,
      effort: 3,
      units: 'metric',
      allergens: [],
      diets: [],
    });
  });
});

describe('recipe bridge', () => {
  const candidate = {
    id: 'mealdb:1',
    slug: 'one',
    title: 'One',
    summary: '',
    cuisine: 'italian',
    region: 'not_a_region',
    course: 'main',
    totalMinutes: 20,
    activeMinutes: 10,
    servings: 2,
    effort: 1,
    imageUrl: null,
    imageCredit: null,
    sourceName: 'Test',
    sourceUrl: null,
    license: 'test',
    nutritionConfidence: 'none',
    nutrition: null,
    allergens: {},
    dietFlags: 0,
    goalTags: [],
    gentle: false,
    healthScore: 0.4,
    familyId: 'one',
    ingredientIds: ['pasta', 'salt', 'tomato', 'pasta'],
  } as unknown as RecipeCandidate;

  it('drops staples from core ingredients and fills missing nutrition', () => {
    const recipe = toDomainRecipe(candidate, new Set(['salt']));
    expect(recipe.coreIngredientIds).toEqual(['pasta', 'tomato']);
    expect(recipe.nutrition.kcal).toBeNull();
    expect(recipe.region).toBe('global');
  });
});

describe('logging an estimated meal', () => {
  beforeEach(() => useCookLogStore.getState().reset());

  it('uses a namespaced id that can never be a catalog recipe', () => {
    expect(estimatedMealId('Crème brûlée & coffee')).toBe('snap:creme-brulee-coffee');
    expect(estimatedMealId('!!!')).toBe(`${ESTIMATED_MEAL_PREFIX}dish`);
    expect(estimatedMealId('x'.repeat(200)).length).toBeLessThanOrEqual(128);
  });

  it('adds an entry to the cook log with the estimate as its note', () => {
    const id = logEstimatedMeal(
      { dishName: 'Pad thai', note: 'Eaten out, estimated from a photo: Pad thai' },
      '2026-11-11T12:30:00.000Z',
    );
    expect(id).not.toBeNull();
    expect(useCookLogStore.getState().entries[id!]).toMatchObject({
      recipeId: 'snap:pad-thai',
      cookedAt: '2026-11-11T12:30:00.000Z',
      notes: 'Eaten out, estimated from a photo: Pad thai',
      rating: null,
    });
  });
});
