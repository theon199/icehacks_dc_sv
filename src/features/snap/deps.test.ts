import { useSessionStore } from '@/features/auth';
import { defaultPreferences, useCookLogStore } from '@/stores';

import {
  estimatedMealId,
  ESTIMATED_MEAL_PREFIX,
  logEstimatedMeal,
  onAccountChange,
  toDomainRecipe,
  toSafetyPrefs,
  toUserPreferences,
} from './deps';
import { useSnapSession } from './snapSession';
import { catalogRecipe } from './testing';

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
  const candidate = catalogRecipe({
    id: 'catalog:1',
    title: 'One',
    cuisine: 'italian',
    region: 'not_a_region',
    nutritionConfidence: 'none',
    nutrition: null,
    healthScore: 0.4,
    ingredientIds: ['pasta', 'salt', 'tomato', 'pasta'],
  });

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

describe('account changes', () => {
  const result = {
    id: 'snap-1',
    mode: 'dish' as const,
    photoUri: 'file:///plate.jpg',
    takenAt: 0,
    remaining: null,
    dish: {
      name: 'pad thai',
      cuisine: null,
      key_ingredients: [],
      portion: 'one plate',
      nutrition: {
        kcal: { estimate: 600, low: 500, high: 700 },
        protein_g: { estimate: 20, low: 15, high: 25 },
        carbs_g: { estimate: 80, low: 70, high: 90 },
        fat_g: { estimate: 20, low: 15, high: 25 },
        fiber_g: { estimate: 4, low: 3, high: 5 },
        sodium_mg: { estimate: 1200, low: 1000, high: 1400 },
      },
      nutrition_confidence: 'estimated' as const,
      confidence: 0.8,
    },
  };

  it('drops the last snap when someone signs out or another account signs in', () => {
    useSessionStore.setState({ userId: 'person-a' });
    useSnapSession.getState().setResult(result);
    expect(useSnapSession.getState().result).not.toBeNull();

    useSessionStore.setState({ userId: null });
    expect(useSnapSession.getState().result).toBeNull();

    useSnapSession.getState().setResult(result);
    useSessionStore.setState({ userId: 'person-b' });
    expect(useSnapSession.getState().result).toBeNull();
  });

  it('tells listeners only about real account changes', () => {
    const listener = jest.fn();
    useSessionStore.setState({ userId: 'person-a' });
    const stop = onAccountChange(listener);
    useSessionStore.setState({ aiConsent: true });
    expect(listener).not.toHaveBeenCalled();
    useSessionStore.setState({ userId: 'person-c' });
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });
});
