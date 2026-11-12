import {
  ALLERGEN_IDS,
  DEFAULT_PREFERENCES,
  DIET_FLAG_NAMES,
  GOAL_IDS,
  compileSafetyRules,
  type FeedbackEvent as DomainFeedbackEvent,
} from '@/domain';

import {
  GOAL_TO_DOMAIN,
  toDomainFeedback,
  toDomainGoal,
  toDomainGoals,
  toSafetyPrefs,
  toStoredGoal,
  toUserPreferences,
} from './domainBridge';
import type { FeedbackEvent } from './feedback';
import { defaultPreferences, HEALTH_GOALS, type Preferences } from './preferences';

const answered = (patch: Partial<Preferences> = {}): Preferences => ({
  ...defaultPreferences,
  allergensAnswered: true,
  ...patch,
});

describe('goal ids', () => {
  it('maps every stored goal to a domain goal and back', () => {
    for (const goal of HEALTH_GOALS) expect(toStoredGoal(toDomainGoal(goal))).toBe(goal);
    for (const goal of GOAL_IDS) expect(toDomainGoal(toStoredGoal(goal))).toBe(goal);
  });

  it('covers both vocabularies one to one', () => {
    expect(Object.keys(GOAL_TO_DOMAIN).sort()).toEqual([...HEALTH_GOALS].sort());
    expect(Object.values(GOAL_TO_DOMAIN).sort()).toEqual([...GOAL_IDS].sort());
  });

  it('keeps the stored spelling of the steadier energy goal', () => {
    expect(toDomainGoal('steadier_energy')).toBe('steady_energy');
    expect(toStoredGoal('steady_energy')).toBe('steadier_energy');
  });

  it('lists each goal once, in the order given', () => {
    expect(toDomainGoals(['steadier_energy', 'more_fiber', 'steadier_energy'])).toEqual([
      'steady_energy',
      'more_fiber',
    ]);
  });
});

describe('toSafetyPrefs', () => {
  it('reads unanswered allergens as unanswered, whatever the lists hold', () => {
    const safety = toSafetyPrefs({
      allergens: ['peanut'],
      diets: ['vegan'],
      allergensAnswered: false,
    });
    expect(safety).toEqual({ allergens: null, diets: null });
    expect(compileSafetyRules(safety).answered).toBe(false);
  });

  it('reads an explicit "none" as an empty answer', () => {
    const safety = toSafetyPrefs({ allergens: [], diets: [], allergensAnswered: true });
    expect(safety).toEqual({ allergens: [], diets: [] });
    expect(compileSafetyRules(safety).answered).toBe(true);
  });

  it('passes given answers through', () => {
    expect(
      toSafetyPrefs({ allergens: ['sesame'], diets: ['pescatarian'], allergensAnswered: true }),
    ).toEqual({ allergens: ['sesame'], diets: ['pescatarian'] });
  });
});

describe('toUserPreferences', () => {
  it('leaves both safety answers unanswered until allergens are answered', () => {
    const prefs = toUserPreferences({ ...defaultPreferences, diets: ['vegan'] }, 'us');
    expect(prefs.allergens).toBeNull();
    expect(prefs.diets).toBeNull();
  });

  it('counts diets as answered together with allergens, before onboarding finishes', () => {
    const prefs = toUserPreferences(answered({ diets: ['vegetarian'], onboardedAt: null }), 'us');
    expect(prefs.allergens).toEqual([]);
    expect(prefs.diets).toEqual(['vegetarian']);
  });

  it('maps the stored fields into the domain vocabulary', () => {
    const prefs = toUserPreferences(
      answered({
        cuisines: ['thai', 'thai', 'ethiopian'],
        allergens: ['milk'],
        goals: ['steadier_energy', 'more_protein'],
        maxMinutes: 30,
        effort: 2,
        householdSize: 4,
        smallAppetite: true,
      }),
      'metric',
    );
    expect(prefs).toEqual({
      cuisines: ['thai', 'ethiopian'],
      diets: [],
      allergens: ['milk'],
      goals: ['steady_energy', 'more_protein'],
      timeBudgetMinutes: 30,
      effort: 2,
      householdSize: 4,
      smallAppetite: true,
      units: 'metric',
    });
  });

  it('reads no stated effort as any effort', () => {
    expect(toUserPreferences(answered({ effort: null }), 'us').effort).toBe(3);
  });

  it('drops a cuisine id the domain cannot read and keeps the other answers', () => {
    const prefs = toUserPreferences(
      answered({ cuisines: ['Thai Food', 'greek'], allergens: ['egg'] }),
      'us',
    );
    expect(prefs.cuisines).toEqual(['greek']);
    expect(prefs.allergens).toEqual(['egg']);
  });

  it('falls back to unanswered defaults when the document does not fit the domain', () => {
    const odd = answered({ allergens: ['peanut'], householdSize: 0 });
    expect(toUserPreferences(odd, 'us')).toEqual(DEFAULT_PREFERENCES);
    expect(DEFAULT_PREFERENCES.allergens).toBeNull();
    // The person's units survive the fallback; only the answers are reset.
    const metric = toUserPreferences(odd, 'metric');
    expect(metric).toEqual({ ...DEFAULT_PREFERENCES, units: 'metric' });
    expect(metric.allergens).toBeNull();
    expect(metric.diets).toBeNull();
  });

  it('accepts every stored diet and allergen id', () => {
    const prefs = toUserPreferences(
      answered({ diets: [...DIET_FLAG_NAMES], allergens: [...ALLERGEN_IDS] }),
      'us',
    );
    expect(prefs.diets).toEqual([...DIET_FLAG_NAMES]);
    expect(prefs.allergens).toEqual([...ALLERGEN_IDS]);
  });
});

describe('toDomainFeedback', () => {
  let seq = 0;
  function stored(
    kind: FeedbackEvent['kind'],
    recipeId: string,
    minute: number,
    extra: Partial<FeedbackEvent> = {},
  ): FeedbackEvent {
    seq += 1;
    return {
      id: `e${seq}`,
      recipeId,
      kind,
      reason: null,
      ingredientId: null,
      at: new Date(Date.UTC(2026, 10, 1, 12, minute)).toISOString(),
      ...extra,
    };
  }
  const kinds = (events: readonly DomainFeedbackEvent[]) =>
    events.map((event) => `${event.kind}:${event.recipeId}`);

  it('converts timestamps to epoch milliseconds and keeps the order', () => {
    const events = toDomainFeedback([stored('like', 'a', 0), stored('cooked', 'b', 5)]);
    expect(events).toEqual([
      { recipeId: 'a', kind: 'like', at: Date.UTC(2026, 10, 1, 12, 0), reasons: [] },
      { recipeId: 'b', kind: 'cooked', at: Date.UTC(2026, 10, 1, 12, 5), reasons: [] },
    ]);
  });

  it('lets an unsave cancel only the latest earlier save of that recipe', () => {
    const events = toDomainFeedback([
      stored('save', 'a', 0),
      stored('save', 'b', 1),
      stored('save', 'a', 2),
      stored('unsave', 'a', 3),
      stored('save', 'a', 4),
    ]);
    // The first save of `a` stands; the second is withdrawn; the third came after the unsave.
    expect(events.map((event) => event.at)).toEqual([
      Date.UTC(2026, 10, 1, 12, 0),
      Date.UTC(2026, 10, 1, 12, 1),
      Date.UTC(2026, 10, 1, 12, 4),
    ]);
  });

  it('ignores an unsave with no save before it, and a second unsave in a row', () => {
    const events = toDomainFeedback([
      stored('unsave', 'a', 0),
      stored('save', 'a', 1),
      stored('like', 'a', 2),
      stored('unsave', 'a', 3),
      stored('unsave', 'a', 4),
    ]);
    expect(kinds(events)).toEqual(['like:a']);
  });

  it('never passes an unsave on', () => {
    expect(toDomainFeedback([stored('unsave', 'a', 0)])).toEqual([]);
  });

  it('skips events whose time cannot be read, without cancelling a save', () => {
    const events = toDomainFeedback([
      stored('like', 'a', 0, { at: 'not a time' }),
      stored('save', 'b', 1),
      stored('unsave', 'b', 2, { at: '' }),
    ]);
    expect(kinds(events)).toEqual(['save:b']);
  });

  it('keeps the ingredient named with dislike_ingredient', () => {
    const [event] = toDomainFeedback([
      stored('not_for_me', 'a', 0, { reason: 'dislike_ingredient', ingredientId: 'cilantro' }),
    ]);
    expect(event).toEqual({
      recipeId: 'a',
      kind: 'not_for_me',
      at: Date.UTC(2026, 10, 1, 12, 0),
      reasons: ['dislike_ingredient'],
      ingredientId: 'cilantro',
    });
  });

  it('drops an ingredient stored with any other reason, and reasons on other kinds', () => {
    const [tooLong, like] = toDomainFeedback([
      stored('not_for_me', 'a', 0, { reason: 'too_long', ingredientId: 'okra' }),
      stored('like', 'b', 1, { reason: 'too_heavy', ingredientId: 'okra' }),
    ]);
    expect(tooLong).toEqual({
      recipeId: 'a',
      kind: 'not_for_me',
      at: Date.UTC(2026, 10, 1, 12, 0),
      reasons: ['too_long'],
    });
    expect(like).toEqual({
      recipeId: 'b',
      kind: 'like',
      at: Date.UTC(2026, 10, 1, 12, 1),
      reasons: [],
    });
  });

  it('keeps a not-for-me with no reason as an empty reasons list', () => {
    const [event] = toDomainFeedback([stored('not_for_me', 'a', 0)]);
    expect(event).toEqual({
      recipeId: 'a',
      kind: 'not_for_me',
      at: Date.UTC(2026, 10, 1, 12, 0),
      reasons: [],
    });
  });
});
