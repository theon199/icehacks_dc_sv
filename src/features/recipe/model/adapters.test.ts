import { checkRecipe } from '@/domain';
import type { FeedbackEvent } from '@/stores';

import {
  coreIngredientIds,
  targetGoalTags,
  toDomainFeedback,
  toDomainPreferences,
  toDomainRecipe,
  toTargetDetails,
} from './adapters';
import { allergenMap, ingredient, makeDetail, prefs } from '../test/fixtures';

describe('toDomainPreferences', () => {
  it('keeps safety answers unanswered until the person has answered', () => {
    const domain = toDomainPreferences(
      prefs({ allergensAnswered: false, allergens: [], diets: [] }),
      'us',
    );
    expect(domain.allergens).toBeNull();
    expect(domain.diets).toBeNull();
    // With unanswered safety questions no recipe is treated as safe.
    expect(checkRecipe({ allergens: allergenMap(), dietFlags: 511 }, domain).eligible).toBe(false);
  });

  it('maps answered preferences into the domain vocabulary', () => {
    const domain = toDomainPreferences(
      prefs({
        allergens: ['milk'],
        diets: ['vegetarian'],
        goals: ['steadier_energy', 'more_protein'],
        maxMinutes: 30,
        effort: null,
      }),
      'metric',
    );
    expect(domain).toMatchObject({
      allergens: ['milk'],
      diets: ['vegetarian'],
      goals: ['steady_energy', 'more_protein'],
      timeBudgetMinutes: 30,
      effort: 3,
      units: 'metric',
    });
  });
});

describe('toDomainRecipe', () => {
  it('fills missing nutrition with unknowns and an unknown region with global', () => {
    const recipe = toDomainRecipe(
      makeDetail({ nutrition: null, nutritionConfidence: 'none', region: 'atlantis' }),
      [],
    );
    expect(recipe.nutrition.kcal).toBeNull();
    expect(recipe.region).toBe('global');
  });

  it('derives core ingredients without staples or optional lines', () => {
    const detail = makeDetail();
    const mint = { ...detail.ingredients[0]!, position: 9, ingredientId: 'mint', optional: true };
    const ids = coreIngredientIds(
      [...detail.ingredients, mint],
      new Map([['salt', ingredient('salt', { pantryStaple: true })]]),
    );
    expect(ids).toEqual(['chickpea', 'onion', 'egg']);
  });
});

function event(id: string, overrides: Partial<FeedbackEvent>): FeedbackEvent {
  return {
    id,
    recipeId: 'r',
    kind: 'like',
    reason: null,
    ingredientId: null,
    at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('toDomainFeedback', () => {
  it('converts times, keeps reasons and drops events ranking does not use', () => {
    const events = toDomainFeedback([
      event('1', {}),
      event('2', { kind: 'unsave' }),
      event('3', {
        kind: 'not_for_me',
        reason: 'dislike_ingredient',
        ingredientId: 'okra',
        at: '2026-01-03T00:00:00.000Z',
      }),
      event('4', { at: 'garbage' }),
    ]);
    expect(events).toEqual([
      { recipeId: 'r', kind: 'like', at: Date.parse('2026-01-01T00:00:00.000Z'), reasons: [] },
      {
        recipeId: 'r',
        kind: 'not_for_me',
        at: Date.parse('2026-01-03T00:00:00.000Z'),
        reasons: ['dislike_ingredient'],
        ingredientId: 'okra',
      },
    ]);
  });
});

describe('targets input', () => {
  it('passes only goals that move targets', () => {
    expect(targetGoalTags(['more_protein', 'more_fiber', 'lower_sodium'])).toEqual([
      'high_protein',
      'lower_sodium',
    ]);
  });

  it('treats an unspecified sex as unknown', () => {
    expect(
      toTargetDetails({ heightCm: 170, weightKg: 70, sex: 'unspecified', activity: null }, 40),
    ).toEqual({ age: 40, heightCm: 170, weightKg: 70, sex: null, activity: null });
  });
});
