/**
 * What Chef's answer becomes when the person's allergen or diet answers change while Chef is still
 * writing it. The answer was written for the old answers, so its wording can recommend a dish (or
 * an ingredient) that is no longer safe for them. The cards can be re-checked one by one, but the
 * prose cannot, so in that case the prose is replaced by a short notice and only the cards that
 * pass against the current answers are kept.
 */
import type { SafetyPrefs } from '@/domain/safety';
import type { RecipeSummary } from '@/lib/catalog';

import { screenSuggestedIds, type RecipeFinder } from './screening';

export const PREFERENCES_CHANGED_NOTICE =
  "Your food preferences changed while I was answering. Ask again and I'll use the new ones.";

/**
 * Whether `after` rules out something `before` allowed: the safety answers became unanswered, or a
 * declared allergen or diet was added. Removing one only widens what is safe, so it does not count.
 */
export function safetyBecameStricter(before: SafetyPrefs, after: SafetyPrefs): boolean {
  if (after.allergens === null || after.diets === null) {
    return before.allergens !== null && before.diets !== null;
  }
  if (before.allergens === null || before.diets === null) return false;
  const hadAllergens = new Set<string>(before.allergens);
  const hadDiets = new Set<string>(before.diets);
  return (
    after.allergens.some((allergen) => !hadAllergens.has(allergen)) ||
    after.diets.some((diet) => !hadDiets.has(diet))
  );
}

export interface SettledReply<R extends RecipeSummary = RecipeSummary> {
  /** What is stored and shown as Chef's answer. */
  readonly text: string;
  /** Recipes that pass against the current answers, in the order Chef named them. */
  readonly recipes: readonly R[];
  /** Every id Chef named that is not shown: unknown, malformed or unsafe now. */
  readonly dropped: readonly string[];
  /** True when the answer's wording was replaced by `PREFERENCES_CHANGED_NOTICE`. */
  readonly replaced: boolean;
}

export interface ReplyToSettle<R extends RecipeSummary = RecipeSummary> {
  readonly text: string;
  readonly recipeIds: readonly unknown[];
  readonly find: RecipeFinder<R>;
  /** Safety answers the question was asked (and the candidates were screened) with. */
  readonly askedWith: SafetyPrefs;
  /** Safety answers at the moment the answer arrived. */
  readonly current: SafetyPrefs;
}

/**
 * Re-checks Chef's answer against the current safety answers. The wording is kept only when the
 * change (if any) neither removed a card that passed for the question as asked, nor added an
 * allergen or diet the wording could not have known about.
 */
export function settleReply<R extends RecipeSummary>(reply: ReplyToSettle<R>): SettledReply<R> {
  const now = screenSuggestedIds(reply.recipeIds, reply.find, reply.current);
  const asAsked = screenSuggestedIds(reply.recipeIds, reply.find, reply.askedWith);
  const stillShown = new Set(now.safe.map((recipe) => recipe.id));
  const removedByChange = asAsked.safe.some((recipe) => !stillShown.has(recipe.id));
  const replaced = removedByChange || safetyBecameStricter(reply.askedWith, reply.current);
  return {
    text: replaced ? PREFERENCES_CHANGED_NOTICE : reply.text,
    recipes: now.safe,
    dropped: now.dropped,
    replaced,
  };
}
