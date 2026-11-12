import { defaultPreferences, type FeedbackEvent } from '@/stores';

import { makeCandidate } from './__fixtures__/recipes';
import {
  goalTagsFor,
  targetGoalsFor,
  toDomainFeedback,
  toDomainPersonalDetails,
  toDomainPreferences,
  toDomainRecipe,
  toNutritionFacts,
  toPantryIds,
} from './deps';

describe('preferences bridge', () => {
  it('keeps safety answers fail-closed until they are given', () => {
    const fresh = toDomainPreferences(defaultPreferences);
    expect(fresh.allergens).toBeNull();
    expect(fresh.diets).toBeNull();

    const answered = toDomainPreferences({
      ...defaultPreferences,
      allergens: ['egg'],
      allergensAnswered: true,
      onboardedAt: '2026-11-01T00:00:00.000Z',
    });
    expect(answered.allergens).toEqual(['egg']);
    expect(answered.diets).toEqual([]);
  });

  it('maps goal names and fills defaults the recommender needs', () => {
    const p = toDomainPreferences({
      ...defaultPreferences,
      goals: ['steadier_energy', 'more_fiber'],
      effort: null,
      maxMinutes: 30,
    });
    expect(p.goals).toEqual(['steady_energy', 'more_fiber']);
    expect(p.effort).toBe(3);
    expect(p.timeBudgetMinutes).toBe(30);
  });

  it('derives recipe tags and target goals from stored goals', () => {
    expect(goalTagsFor(['heart_friendly', 'steadier_energy'])).toEqual([
      'heart_friendly',
      'lower_sat_fat',
      'high_fiber',
      'high_protein',
    ]);
    expect(targetGoalsFor(['more_protein', 'plant_forward', 'lower_sodium'])).toEqual([
      'high_protein',
      'lower_sodium',
    ]);
  });
});

describe('recipe bridges', () => {
  it('fills missing nutrition and an unknown region safely', () => {
    const r = toDomainRecipe(makeCandidate('a', { nutrition: null, region: 'atlantis' }));
    expect(r.nutrition.kcal).toBeNull();
    expect(r.region).toBe('global');
    expect(r.coreIngredientIds).toEqual(['a-a', 'a-b']);
  });

  it('renames nutrition fields for the nutrition domain', () => {
    expect(toNutritionFacts(null)).toEqual({});
    expect(toNutritionFacts(makeCandidate('a').nutrition)).toMatchObject({
      kcal: 550,
      sat_fat_g: 4,
      added_sugar_g: 2,
    });
  });
});

describe('user data bridges', () => {
  it('reads personal details with an unstated sex as unknown', () => {
    expect(
      toDomainPersonalDetails(
        { heightCm: 170, weightKg: 70, sex: 'unspecified', activity: 'moderate' },
        34,
      ),
    ).toEqual({ age: 34, sex: null, heightCm: 170, weightKg: 70, activity: 'moderate' });
  });

  it('collects matched pantry ingredients once', () => {
    const item = {
      name: 'x',
      qty: null,
      unit: null,
      category: 'other' as const,
      addedAt: '',
      expiresAt: null,
    };
    expect(
      toPantryIds({
        a: { ...item, id: 'a', ingredientId: 'rice' },
        b: { ...item, id: 'b', ingredientId: 'rice' },
        c: { ...item, id: 'c', ingredientId: null },
      }),
    ).toEqual(['rice']);
  });

  it('converts feedback timestamps and drops kinds ranking does not use', () => {
    const base = { id: '1', recipeId: 'r', reason: null, ingredientId: null };
    const events: FeedbackEvent[] = [
      { ...base, kind: 'like', at: '2026-11-10T08:00:00.000Z' },
      { ...base, id: '2', kind: 'unsave', at: '2026-11-10T09:00:00.000Z' },
      { ...base, id: '3', kind: 'not_for_me', reason: 'too_long', at: '2026-11-10T10:00:00.000Z' },
      { ...base, id: '4', kind: 'like', at: 'not a date' },
    ];
    expect(toDomainFeedback(events)).toEqual([
      { recipeId: 'r', kind: 'like', at: Date.parse('2026-11-10T08:00:00.000Z'), reasons: [] },
      {
        recipeId: 'r',
        kind: 'not_for_me',
        at: Date.parse('2026-11-10T10:00:00.000Z'),
        reasons: ['too_long'],
      },
    ]);
  });
});
