import { feedbackEventSchema, impressionSchema } from './feedback';
import { pantryIds, pantryItemSchema } from './pantry';
import { DEFAULT_PREFERENCES, userPreferencesSchema, userProfileSchema } from './preferences';

describe('user preferences', () => {
  it('fills defaults for an empty document', () => {
    expect(DEFAULT_PREFERENCES).toEqual({
      cuisines: [],
      diets: [],
      allergens: [],
      goals: [],
      timeBudgetMinutes: null,
      effort: 2,
      householdSize: 2,
      smallAppetite: false,
      units: 'us',
    });
  });

  it('dedupes lists and keeps at most five loved cuisines', () => {
    const prefs = userPreferencesSchema.parse({
      cuisines: ['thai', 'thai', 'indian', 'mexican', 'italian', 'greek', 'french'],
      allergens: ['peanut', 'peanut'],
    });
    expect(prefs.cuisines).toEqual(['thai', 'indian', 'mexican', 'italian', 'greek']);
    expect(prefs.allergens).toEqual(['peanut']);
  });

  it('rejects values outside the vocabulary', () => {
    expect(userPreferencesSchema.safeParse({ allergens: ['nuts'] }).success).toBe(false);
    expect(userPreferencesSchema.safeParse({ diets: ['keto'] }).success).toBe(false);
    expect(userPreferencesSchema.safeParse({ effort: 5 }).success).toBe(false);
    expect(userPreferencesSchema.safeParse({ householdSize: 0 }).success).toBe(false);
  });

  it('parses a profile with default preferences', () => {
    const profile = userProfileSchema.parse({ userId: 'u1', updatedAt: 1 });
    expect(profile.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(profile.birthYear).toBeNull();
  });
});

describe('feedback events', () => {
  it('keeps reasons only for not-for-me feedback', () => {
    expect(
      feedbackEventSchema.parse({ recipeId: 'r', kind: 'like', at: 5, reasons: ['too_long'] }),
    ).toEqual({ recipeId: 'r', kind: 'like', at: 5, reasons: [] });
  });

  it('keeps the disliked ingredient only alongside that reason', () => {
    expect(
      feedbackEventSchema.parse({
        recipeId: 'r',
        kind: 'not_for_me',
        at: 5,
        reasons: ['dislike_ingredient', 'dislike_ingredient'],
        ingredientId: 'cilantro',
      }),
    ).toEqual({
      recipeId: 'r',
      kind: 'not_for_me',
      at: 5,
      reasons: ['dislike_ingredient'],
      ingredientId: 'cilantro',
    });
    expect(
      feedbackEventSchema.parse({
        recipeId: 'r',
        kind: 'not_for_me',
        at: 5,
        reasons: ['too_heavy'],
        ingredientId: 'cilantro',
      }),
    ).not.toHaveProperty('ingredientId');
  });

  it('rejects unknown kinds and negative times', () => {
    expect(feedbackEventSchema.safeParse({ recipeId: 'r', kind: 'love', at: 1 }).success).toBe(
      false,
    );
    expect(impressionSchema.safeParse({ recipeId: 'r', at: -1 }).success).toBe(false);
  });
});

describe('pantry items', () => {
  it('fills optional fields and collects ids', () => {
    const item = pantryItemSchema.parse({ ingredientId: 'rice', name: ' Rice ', addedAt: 1 });
    expect(item).toEqual({
      ingredientId: 'rice',
      name: 'Rice',
      quantity: null,
      unit: null,
      addedAt: 1,
      expiresAt: null,
    });
    expect(pantryIds([item, { ingredientId: 'egg' }])).toEqual(new Set(['rice', 'egg']));
  });
});
