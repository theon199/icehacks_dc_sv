/**
 * The one place Snap reaches into code owned by other areas. Everything here is a thin adapter so
 * that when a sibling module lands (or a shared shape changes) only this file moves.
 *
 * - `AiGate`: Chef's shared 18+ and AI-consent gate. Snap is a tab root, which `Stack.Protected`
 *   cannot guard, so the screen renders the gate itself. `describeAiProblem` and `waitPhrase` are
 *   Chef's wording for AI failures; Snap adds only what is specific to photos.
 * - Preference and recipe bridges: the app-wide translations from the user stores and the catalog
 *   to the domain shapes ranking and safety expect (`@/stores/domainBridge`, `@/lib/catalog`).
 *   They translate one way only (store/catalog → domain) and fail closed.
 * - `onAccountChange`: tells Snap when the signed-in account changes, so in-memory results from one
 *   account are never shown to the next.
 * - `logEstimatedMeal`: the cook log has no field for meals eaten out, so an estimate is recorded
 *   under a namespaced id with a readable note. See `ESTIMATED_MEAL_PREFIX`.
 */
import { useSessionStore } from '@/features/auth';
import { useCookLogStore } from '@/stores';

export { selectCanUseAi, useSessionStore } from '@/features/auth';
export { AiGate, describeAiProblem, waitPhrase, type AiProblem } from '@/features/chef';

// --- Account -----------------------------------------------------------------------------------

/** Calls `listener` whenever the signed-in account changes, signing out included. */
export function onAccountChange(listener: () => void): () => void {
  return useSessionStore.subscribe((state, previous) => {
    if (state.userId !== previous.userId) listener();
  });
}

// --- Preferences and recipes ------------------------------------------------------------------

export { toSafetyPrefs, toUserPreferences } from '@/stores/domainBridge';
export { toDomainRecipe } from '@/lib/catalog';

// --- Cook log ----------------------------------------------------------------------------------

/**
 * Cook log ids for meals estimated from a photo start with this, so they can never be mistaken for
 * a catalog recipe the person cooked.
 */
export const ESTIMATED_MEAL_PREFIX = 'snap:';

export interface EstimatedMeal {
  dishName: string;
  /** Human-readable summary of the estimate, stored as the entry's note. */
  note: string;
}

/** `snap:chicken-tikka-masala`; falls back to `snap:dish` for names with no letters or digits. */
export function estimatedMealId(dishName: string): string {
  const slug = dishName
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return `${ESTIMATED_MEAL_PREFIX}${slug || 'dish'}`;
}

/** Records the meal in today's cook log. Returns the entry id, or null when it was rejected. */
export function logEstimatedMeal(meal: EstimatedMeal, at?: string): string | null {
  return useCookLogStore
    .getState()
    .log({ recipeId: estimatedMealId(meal.dishName), notes: meal.note.slice(0, 1000) }, at);
}
