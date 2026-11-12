/**
 * "Meals you can make": catalog recipes ranked by how much of them the person already has.
 *
 * Ranking is delegated to the domain engine (which drops anything unsafe for the person's
 * allergens and diets, fail-closed), then re-ordered by pantry coverage: share of core ingredients
 * on hand first, then how many of the items just photographed it uses, then overall fit.
 */
import { rankRecipes } from '@/domain/recommend';
import type { UserPreferences } from '@/domain/types/preferences';
import type { RecipeSummary } from '@/domain/types/recipe';

export interface PantryMeal {
  recipe: RecipeSummary;
  /** Core ingredients on hand / all core ingredients. */
  owned: number;
  total: number;
  coverage: number;
  /** How many of the photographed items it uses. */
  usesSnapped: number;
  fitScore: number;
}

export interface PantryMealsInput {
  candidates: readonly RecipeSummary[];
  prefs: UserPreferences;
  /** Every catalog ingredient id in the pantry, including the items just added. */
  pantryIds: ReadonlySet<string>;
  /** Ingredient ids of the items just photographed and added. */
  snappedIds: ReadonlySet<string>;
  now: number;
  limit?: number;
  /** Recipes covering less than this share are left out. */
  minCoverage?: number;
}

export const DEFAULT_MEAL_LIMIT = 20;
export const DEFAULT_MIN_COVERAGE = 0.3;

function countIn(ids: readonly string[], set: ReadonlySet<string>): number {
  let count = 0;
  for (const id of ids) if (set.has(id)) count++;
  return count;
}

export function mealsFromPantry({
  candidates,
  prefs,
  pantryIds,
  snappedIds,
  now,
  limit = DEFAULT_MEAL_LIMIT,
  minCoverage = DEFAULT_MIN_COVERAGE,
}: PantryMealsInput): PantryMeal[] {
  if (pantryIds.size === 0) return [];
  // Only recipes that use something on hand can be "made with what you have".
  const usable = candidates.filter(
    (recipe) => recipe.coreIngredientIds.length > 0 && countIn(recipe.coreIngredientIds, pantryIds),
  );
  const ranked = rankRecipes(usable, { prefs, now, pantry: pantryIds });
  const meals: PantryMeal[] = [];
  for (const entry of ranked) {
    const ids = entry.recipe.coreIngredientIds;
    const owned = countIn(ids, pantryIds);
    const coverage = owned / ids.length;
    if (coverage < minCoverage) continue;
    meals.push({
      recipe: entry.recipe,
      owned,
      total: ids.length,
      coverage,
      usesSnapped: countIn(ids, snappedIds),
      fitScore: entry.fitScore,
    });
  }
  meals.sort(
    (a, b) =>
      b.coverage - a.coverage ||
      b.usesSnapped - a.usesSnapped ||
      b.fitScore - a.fitScore ||
      (a.recipe.id < b.recipe.id ? -1 : a.recipe.id > b.recipe.id ? 1 : 0),
  );
  return meals.slice(0, Math.max(0, limit));
}
