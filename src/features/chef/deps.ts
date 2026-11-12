/**
 * The one seam between Chef and modules it does not own. Everything here is on main or in the
 * data layer; the helpers bridge shapes that do not line up yet (see the notes on each).
 */
import type { SafetyPrefs } from '@/domain/safety';
import type { Preferences } from '@/stores';

export { aiApi, isAiAgeRestricted, isAiQuotaExceeded, isAiRefused } from '@/lib/api/ai';
export { getRecipeSummaries, listCandidates, searchRecipes, useRecipes } from '@/lib/catalog';
export { selectIsAdult, selectCanUseAi, useSessionStore, MIN_AI_AGE } from '@/features/auth';

/** Route of the AI agreement sheet (owned by Settings). */
export const AI_CONSENT_ROUTE = '/ai-consent';

/**
 * The preferences store records "allergens answered" as a flag next to the list, while the safety
 * filter in the domain reads an unanswered question as `null`. This bridges the two without
 * weakening the fail-closed rule: until the allergen question is answered, nothing counts as safe.
 */
export function safetyPrefsFrom(prefs: Preferences): SafetyPrefs {
  return {
    allergens: prefs.allergensAnswered ? prefs.allergens : null,
    diets: prefs.diets,
  };
}
