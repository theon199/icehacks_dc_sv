/**
 * The one seam between Chef and modules it does not own. Everything here is on main or in the
 * data layer; the helpers bridge shapes that do not line up yet (see the notes on each).
 */
export { aiApi, isAiAgeRestricted, isAiQuotaExceeded, isAiRefused } from '@/lib/api/ai';
export { getRecipeSummaries, listCandidates, searchRecipes, useRecipes } from '@/lib/catalog';
export { selectIsAdult, selectCanUseAi, useSessionStore, MIN_AI_AGE } from '@/features/auth';

/** Route of the AI agreement sheet (owned by Settings). */
export const AI_CONSENT_ROUTE = '/ai-consent';

/**
 * Stored allergen and diet answers as the domain's safety filter reads them. Until the allergen
 * question is answered both are `null`, so nothing counts as safe.
 */
export { toSafetyPrefs as safetyPrefsFrom } from '@/stores/domainBridge';
