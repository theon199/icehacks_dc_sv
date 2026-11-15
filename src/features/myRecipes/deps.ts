/**
 * The one place My recipes reaches into code owned by other areas, so a shared shape that moves
 * only moves this file.
 *
 * - The 18+ and AI-consent rules and the consent route; `AiGate` and Chef's wording for AI
 *   failures (`describeAiProblem`, `waitPhrase`).
 * - The safety bridge from stored preferences to the domain (`toSafetyPrefs`): until the person
 *   answers the allergen question both allergens and diets read as `null`, so nothing is safe.
 * - `onAccountChange`: in-memory imports from one account are never shown to the next.
 */
import { useSessionStore } from '@/features/auth';

export { MIN_AI_AGE, selectCanUseAi, selectIsAdult, useSessionStore } from '@/features/auth';
export { AiGate, describeAiProblem, waitPhrase, type AiProblem } from '@/features/chef';
export { toSafetyPrefs } from '@/stores/domainBridge';

/** Where a person reviews what AI features share and turns them on (owned by Settings). */
export const AI_CONSENT_ROUTE = '/ai-consent';

/** Where the allergen and diet answers live (owned by Settings). */
export const PREFERENCES_ROUTE = '/preferences';

/** Calls `listener` whenever the signed-in account changes, signing out included. */
export function onAccountChange(listener: () => void): () => void {
  return useSessionStore.subscribe((state, previous) => {
    if (state.userId !== previous.userId) listener();
  });
}
