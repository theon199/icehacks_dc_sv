import { GOAL_IDS } from '@/domain/types';
import { HEALTH_GOALS, defaultPreferences, preferencesSchema } from '@/stores';

import { emptyDraft, toAnswers } from './onboardingModel';
import {
  answersFromPreferences,
  toDomainGoal,
  toPreferencesPatch,
  toStoredGoal,
} from './preferencesMapping';

describe('goal vocabularies', () => {
  it('maps every onboarding goal to a stored goal and back', () => {
    expect(GOAL_IDS.map(toStoredGoal).sort()).toEqual([...HEALTH_GOALS].sort());
    for (const goal of GOAL_IDS) expect(toDomainGoal(toStoredGoal(goal))).toBe(goal);
  });

  it('translates the steadier energy goal', () => {
    expect(toStoredGoal('steady_energy')).toBe('steadier_energy');
    expect(toDomainGoal('steadier_energy')).toBe('steady_energy');
  });
});

describe('toPreferencesPatch', () => {
  it('produces a valid preferences document, with the time budget as maxMinutes', () => {
    const answers = toAnswers({
      ...emptyDraft,
      noAllergens: true,
      goals: ['steady_energy'],
      timeChosen: true,
      timeBudgetMinutes: 15,
      effort: 1,
    });
    const patch = toPreferencesPatch(answers);
    expect(patch).toMatchObject({ maxMinutes: 15, goals: ['steadier_energy'], effort: 1 });
    expect(preferencesSchema.safeParse({ ...defaultPreferences, ...patch }).success).toBe(true);
  });
});

describe('answersFromPreferences', () => {
  it('has nothing to offer before the allergen question is answered', () => {
    expect(answersFromPreferences(defaultPreferences)).toBeNull();
  });

  it('reads an explicit "no allergies" back', () => {
    const answers = answersFromPreferences({
      ...defaultPreferences,
      allergensAnswered: true,
      maxMinutes: null,
    });
    expect(answers).toMatchObject({ allergens: [], timeBudgetMinutes: null });
  });
});
