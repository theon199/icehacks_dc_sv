import { GOAL_DETAILS } from '@/domain/types';
import { toDomainRecipe as sharedToDomainRecipe } from '@/lib/catalog';
import { defaultPreferences, HEALTH_GOALS, type FeedbackEvent } from '@/stores';
import * as bridge from '@/stores/domainBridge';

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

describe('shared bridges', () => {
  it('re-exports the shared feedback and recipe mappings', () => {
    expect(toDomainFeedback).toBe(bridge.toDomainFeedback);
    expect(toDomainRecipe).toBe(sharedToDomainRecipe);
  });

  it('reads preferences exactly as the shared bridge does', () => {
    const stored = {
      ...defaultPreferences,
      allergensAnswered: true,
      goals: ['more_fiber' as const],
    };
    expect(toDomainPreferences(stored)).toEqual(bridge.toUserPreferences(stored, 'us'));
    expect(toDomainPreferences(stored, 'metric').units).toBe('metric');
  });
});

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

  it('counts diets as answered together with allergens', () => {
    const p = toDomainPreferences({
      ...defaultPreferences,
      diets: ['vegan'],
      allergensAnswered: true,
      onboardedAt: null,
    });
    expect(p.diets).toEqual(['vegan']);
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

  it('derives the planner bonus tags from each goal through the shared goal map', () => {
    for (const goal of HEALTH_GOALS) {
      expect(goalTagsFor([goal])).toEqual(GOAL_DETAILS[bridge.toDomainGoal(goal)].servedBy);
    }
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

  it('uses the catalog core ingredients, leaving staples out', () => {
    const r = toDomainRecipe(
      makeCandidate('a', { ingredientIds: ['a-a', 'salt'], coreIngredientIds: ['a-a'] }),
    );
    expect(r.coreIngredientIds).toEqual(['a-a']);
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

  it('converts feedback timestamps and lets an unsave withdraw the save before it', () => {
    const base = { id: '1', recipeId: 'r', reason: null, ingredientId: null };
    const events: FeedbackEvent[] = [
      { ...base, kind: 'like', at: '2026-11-10T08:00:00.000Z' },
      { ...base, id: '5', kind: 'save', at: '2026-11-10T08:30:00.000Z' },
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
