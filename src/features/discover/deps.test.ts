import { defaultPreferences, type FeedbackEvent as StoredFeedbackEvent } from '@/stores';

import { candidate } from './__fixtures__/catalog';
import {
  dayTiltFor,
  dayTiltNote,
  DINNER_FROM_HOUR,
  NO_DAY_HINTS,
  toRankFeedback,
  toRankPreferences,
  toRankRecipe,
  withDayTilt,
} from './deps';

function stored(
  kind: StoredFeedbackEvent['kind'],
  recipeId: string,
  at: string,
  extra: Partial<StoredFeedbackEvent> = {},
): StoredFeedbackEvent {
  return {
    id: `${kind}-${recipeId}-${at}`,
    recipeId,
    kind,
    reason: null,
    ingredientId: null,
    at,
    ...extra,
  };
}

describe('toRankPreferences', () => {
  it('keeps safety answers unanswered until the allergen question is answered', () => {
    const prefs = toRankPreferences({ ...defaultPreferences, diets: ['vegan'] });
    expect(prefs.allergens).toBeNull();
    expect(prefs.diets).toBeNull();
  });

  it('passes answered allergens and diets through, including an explicit none', () => {
    const none = toRankPreferences({ ...defaultPreferences, allergensAnswered: true });
    expect(none.allergens).toEqual([]);
    expect(none.diets).toEqual([]);
    const some = toRankPreferences({
      ...defaultPreferences,
      allergensAnswered: true,
      allergens: ['peanut'],
      diets: ['vegetarian'],
    });
    expect(some.allergens).toEqual(['peanut']);
    expect(some.diets).toEqual(['vegetarian']);
  });

  it('maps goal ids, time budget, effort and units', () => {
    const prefs = toRankPreferences(
      {
        ...defaultPreferences,
        goals: ['steadier_energy', 'more_protein'],
        maxMinutes: 30,
        effort: null,
        smallAppetite: true,
      },
      'metric',
    );
    expect(prefs.goals).toEqual(['steady_energy', 'more_protein']);
    expect(prefs.timeBudgetMinutes).toBe(30);
    expect(prefs.effort).toBe(3);
    expect(prefs.smallAppetite).toBe(true);
    expect(prefs.units).toBe('metric');
  });
});

describe('toRankFeedback', () => {
  it('converts timestamps and keeps the order', () => {
    const events = toRankFeedback([
      stored('like', 'a', '2026-11-01T10:00:00.000Z'),
      stored('pass', 'b', '2026-11-02T10:00:00.000Z'),
    ]);
    expect(events).toEqual([
      { recipeId: 'a', kind: 'like', at: Date.parse('2026-11-01T10:00:00.000Z'), reasons: [] },
      { recipeId: 'b', kind: 'pass', at: Date.parse('2026-11-02T10:00:00.000Z'), reasons: [] },
    ]);
  });

  it('turns a stored reason into the reasons list and keeps a disliked ingredient', () => {
    const [tooLong, ingredient] = toRankFeedback([
      stored('not_for_me', 'a', '2026-11-01T10:00:00.000Z', { reason: 'too_long' }),
      stored('not_for_me', 'b', '2026-11-01T11:00:00.000Z', {
        reason: 'dislike_ingredient',
        ingredientId: 'cilantro',
      }),
    ]);
    expect(tooLong).toMatchObject({ kind: 'not_for_me', reasons: ['too_long'] });
    expect(tooLong).not.toHaveProperty('ingredientId');
    expect(ingredient).toMatchObject({ reasons: ['dislike_ingredient'], ingredientId: 'cilantro' });
  });

  it('lets an unsave cancel the save before it', () => {
    const events = toRankFeedback([
      stored('save', 'a', '2026-11-01T10:00:00.000Z'),
      stored('like', 'a', '2026-11-01T10:01:00.000Z'),
      stored('unsave', 'a', '2026-11-01T10:02:00.000Z'),
      stored('unsave', 'b', '2026-11-01T10:03:00.000Z'),
    ]);
    expect(events.map((event) => event.kind)).toEqual(['like']);
  });

  it('skips events whose time cannot be read', () => {
    expect(toRankFeedback([stored('like', 'a', 'not a date')])).toEqual([]);
  });
});

describe('toRankRecipe', () => {
  it('reshapes a catalog candidate for ranking', () => {
    const recipe = toRankRecipe(
      candidate('x', { ingredientIds: ['egg', 'rice', 'egg'], region: 'atlantis' }),
    );
    expect(recipe.coreIngredientIds).toEqual(['egg', 'rice']);
    expect(recipe.region).toBe('global');
    expect(recipe).not.toHaveProperty('ingredientIds');
  });

  it('reads missing nutrition as unknown values', () => {
    const recipe = toRankRecipe(candidate('x', { nutrition: null, nutritionConfidence: 'none' }));
    expect(recipe.nutrition.kcal).toBeNull();
    expect(recipe.nutrition.proteinG).toBeNull();
  });
});

describe('day tilt', () => {
  const prefs = toRankPreferences({ ...defaultPreferences, allergensAnswered: true });

  it('leaves preferences alone without hints', () => {
    const tilt = dayTiltFor(NO_DAY_HINTS, 19);
    expect(tilt).toEqual({ protein: false, lighter: false });
    expect(withDayTilt(prefs, tilt)).toBe(prefs);
    expect(dayTiltNote(tilt)).toBeNull();
  });

  it('adds a protein goal on an active day', () => {
    const tilt = dayTiltFor({ protein: 0.6, lighter: 0 }, 9);
    expect(withDayTilt(prefs, tilt).goals).toContain('more_protein');
    expect(dayTiltNote(tilt)).toMatch(/protein/);
  });

  it('suggests lighter meals after a short night only once dinner is next', () => {
    const hints = { protein: 0, lighter: 0.6 };
    const morning = dayTiltFor(hints, DINNER_FROM_HOUR - 1);
    const evening = dayTiltFor(hints, DINNER_FROM_HOUR);
    expect(withDayTilt(prefs, morning).goals).not.toContain('lighter_meals');
    expect(withDayTilt(prefs, evening).goals).toContain('lighter_meals');
    expect(dayTiltNote(morning)).toBeNull();
    expect(dayTiltNote(evening)).toMatch(/lighter/);
  });

  it('reads hint strength only as on or off', () => {
    expect(dayTiltFor({ protein: 1, lighter: 0.6 }, 20)).toEqual(
      dayTiltFor({ protein: 0.6, lighter: 0.3 }, 16),
    );
  });

  it('does not repeat a goal the person already has', () => {
    const withGoal = { ...prefs, goals: ['more_protein' as const] };
    expect(withDayTilt(withGoal, { protein: true, lighter: false })).toBe(withGoal);
  });
});
