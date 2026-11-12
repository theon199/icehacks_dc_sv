/**
 * Re-checks recipe ids that came from outside the catalog query path (AI suggestions, deep links,
 * shared posts) before anything is shown. Ids the catalog does not know are rejected.
 */
import {
  checkRecipe,
  compileSafetyRules,
  type SafetyPrefs,
  type SafetyReason,
} from './checkRecipe';
import { type RecipeId, type RecipeSummary } from '../types/recipe';

export type RecipeLookup<R extends RecipeSummary = RecipeSummary> =
  ReadonlyMap<RecipeId, R> | ((id: RecipeId) => R | null | undefined);

export interface ScreenedRecipes<R extends RecipeSummary = RecipeSummary> {
  /** Eligible recipes in the order their ids were given, without duplicates. */
  readonly safe: readonly R[];
  readonly rejected: readonly { readonly id: string; readonly reasons: readonly SafetyReason[] }[];
}

const NOT_IN_CATALOG: SafetyReason = {
  code: 'not_in_catalog',
  message: 'Not a recipe Famara can check',
};

export function screenIds<R extends RecipeSummary>(
  ids: readonly unknown[],
  lookup: RecipeLookup<R>,
  prefs: SafetyPrefs,
): ScreenedRecipes<R> {
  const rules = compileSafetyRules(prefs);
  const find = typeof lookup === 'function' ? lookup : (id: RecipeId) => lookup.get(id);
  const seen = new Set<string>();
  const safe: R[] = [];
  const rejected: { id: string; reasons: readonly SafetyReason[] }[] = [];

  for (const raw of ids) {
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (seen.has(id)) continue;
    seen.add(id);

    const recipe = id ? find(id) : undefined;
    // A lookup that answers with a different recipe is treated as a miss.
    if (!recipe || recipe.id !== id) {
      rejected.push({ id, reasons: [NOT_IN_CATALOG] });
      continue;
    }
    const verdict = checkRecipe(recipe, rules);
    if (verdict.eligible) safe.push(recipe);
    else rejected.push({ id, reasons: verdict.reasons });
  }
  return { safe, rejected };
}
