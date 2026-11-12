/**
 * Local safety checks around Chef. Recipes go through the domain safety filter twice: once before
 * they are offered to Chef as candidates, and again when Chef names them, against the person's
 * preferences at that moment. Anything the catalog cannot vouch for is dropped.
 */
import { compileSafetyRules, isRecipeSafe, type SafetyPrefs } from '@/domain/safety';
import type { RecipeSummary } from '@/lib/catalog';

export interface ScreenedIds<R extends RecipeSummary = RecipeSummary> {
  /** Recipes that passed, in the order they were named, without duplicates. */
  readonly safe: readonly R[];
  /** Ids that were dropped: unknown to the catalog, malformed or not safe for this person. */
  readonly dropped: readonly string[];
}

export type RecipeFinder<R extends RecipeSummary = RecipeSummary> = (id: string) => R | undefined;

/** Re-checks recipe ids that came back from the AI before any of them is shown. */
export function screenSuggestedIds<R extends RecipeSummary>(
  ids: readonly unknown[],
  find: RecipeFinder<R>,
  prefs: SafetyPrefs,
): ScreenedIds<R> {
  const rules = compileSafetyRules(prefs);
  const seen = new Set<string>();
  const safe: R[] = [];
  const dropped: string[] = [];
  for (const raw of ids) {
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (!id) {
      dropped.push(String(raw));
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    const recipe = find(id);
    // A lookup that answers with another recipe is a miss, never a match.
    if (recipe && recipe.id === id && isRecipeSafe(recipe, rules)) safe.push(recipe);
    else dropped.push(id);
  }
  return { safe, dropped };
}

/** Builds a finder over a list of recipes. */
export function finderFor<R extends RecipeSummary>(recipes: readonly R[]): RecipeFinder<R> {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  return (id) => byId.get(id);
}
