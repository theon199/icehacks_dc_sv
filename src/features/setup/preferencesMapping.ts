/**
 * Translation between onboarding answers (shared domain vocabulary) and the synced preferences
 * document in `@/stores`. Pure, so the mapping is tested on its own.
 *
 * Two vocabularies differ: the domain calls the time budget `timeBudgetMinutes` and the steadier
 * energy goal `steady_energy`, while the stored document uses `maxMinutes` and `steadier_energy`.
 * Goal ids are translated by the app-wide bridge (`@/stores/domainBridge`).
 * Allergens are not part of the patch: they go through `setAllergens`, which also records that the
 * question was answered.
 */
import { cuisineIdSchema } from '@/domain/types';
import type { Preferences } from '@/stores';
import { toDomainGoal, toStoredGoal } from '@/stores/domainBridge';

import type { OnboardingAnswers } from './onboardingModel';

export { toDomainGoal, toStoredGoal } from '@/stores/domainBridge';

/** Fields the onboarding answers set, apart from allergens and completion. */
export type OnboardingPreferencesPatch = Pick<
  Preferences,
  | 'displayName'
  | 'cuisines'
  | 'diets'
  | 'goals'
  | 'maxMinutes'
  | 'effort'
  | 'householdSize'
  | 'smallAppetite'
>;

export function toPreferencesPatch(answers: OnboardingAnswers): OnboardingPreferencesPatch {
  return {
    displayName: answers.displayName,
    cuisines: [...answers.cuisines],
    diets: [...answers.diets],
    goals: answers.goals.map(toStoredGoal),
    maxMinutes: answers.timeBudgetMinutes,
    effort: answers.effort,
    householdSize: answers.householdSize,
    smallAppetite: answers.smallAppetite,
  };
}

/**
 * Answers already on this account (synced from another device, or an earlier run), to prefill the
 * questionnaire. Null until the allergen question has been answered, since a draft built from
 * defaults would otherwise read as an explicit "no allergies". Pantry starters are not kept as
 * such, so they start empty.
 */
export function answersFromPreferences(prefs: Preferences): OnboardingAnswers | null {
  if (!prefs.allergensAnswered) return null;
  return {
    displayName: prefs.displayName,
    cuisines: prefs.cuisines.filter((id) => cuisineIdSchema.safeParse(id).success),
    diets: [...prefs.diets],
    allergens: [...prefs.allergens],
    goals: prefs.goals.map(toDomainGoal),
    timeBudgetMinutes: prefs.maxMinutes,
    effort: prefs.effort,
    householdSize: prefs.householdSize,
    pantryStaples: [],
    smallAppetite: prefs.smallAppetite,
  };
}
