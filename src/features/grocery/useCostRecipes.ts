/**
 * The catalog recipes behind a recipe-based cost estimate (one recipe, or several, such as a
 * planned week), each scaled to the servings asked for.
 */
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { ShoppingRecipe } from '@/domain/shopping';
import { catalogKeys, getRecipeDetail, type RecipeDetail } from '@/lib/catalog';

/** One recipe to cost, for `servings` (its own yield when omitted). */
export interface CostRecipe {
  readonly recipeId: string;
  readonly servings?: number | undefined;
}

export type CostRecipesState =
  | { readonly status: 'loading' }
  /** Nothing could be read: every recipe is unknown, or the catalog failed. */
  | { readonly status: 'unavailable' }
  | {
      readonly status: 'ready';
      readonly recipes: readonly ShoppingRecipe[];
      /** Servings planned across all the recipes. */
      readonly servings: number;
    };

function usableServings(servings: number | null | undefined): number | null {
  return servings != null && Number.isFinite(servings) && servings > 0 ? servings : null;
}

/** The recipe as a planned shopping recipe, scaled to `servings` when given. */
export function toShoppingRecipe(recipe: RecipeDetail, servings?: number): ShoppingRecipe {
  return {
    recipeId: recipe.id,
    servings: recipe.servings,
    plannedServings: usableServings(servings) ?? recipe.servings,
    ingredients: recipe.ingredients.map((line) => ({
      ingredient_id: line.ingredientId,
      text: line.text,
      quantity: line.quantity,
      unit: line.unit,
      grams: line.grams,
      optional: line.optional,
    })),
  };
}

type Entry = readonly [recipeId: string, servings: number | null];

/**
 * A string that is equal for equal entries, so a caller passing a fresh array with the same
 * recipes and servings on every render does not recompute the estimate.
 */
export function costRecipesKey(entries: readonly CostRecipe[]): string {
  const normalised: Entry[] = entries
    .filter((entry) => entry.recipeId.length > 0)
    .map((entry) => [entry.recipeId, usableServings(entry.servings)]);
  return JSON.stringify(normalised);
}

function parseKey(key: string): Entry[] {
  return JSON.parse(key) as Entry[];
}

/**
 * The recipes in one estimate, scaled and in the order given. A recipe the catalog does not have
 * is skipped so one stale id cannot hide a week's estimate; the state is `unavailable` only when
 * none of them can be read.
 */
export function buildCostRecipes(
  entries: readonly Entry[],
  details: ReadonlyMap<string, RecipeDetail | null>,
): CostRecipesState {
  if (entries.length === 0) return { status: 'ready', recipes: [], servings: 0 };
  const recipes: ShoppingRecipe[] = [];
  let servings = 0;
  for (const [recipeId, wanted] of entries) {
    const detail = details.get(recipeId);
    if (!detail) continue;
    const recipe = toShoppingRecipe(detail, wanted ?? undefined);
    recipes.push(recipe);
    servings += recipe.plannedServings;
  }
  return recipes.length > 0 ? { status: 'ready', recipes, servings } : { status: 'unavailable' };
}

interface CombinedDetails {
  readonly pending: boolean;
  readonly failed: boolean;
  readonly data: readonly (RecipeDetail | null | undefined)[];
}

// Module-level so React Query can keep the combined result stable between renders.
function combineDetails(results: UseQueryResult<RecipeDetail | null>[]): CombinedDetails {
  return {
    pending: results.some((r) => r.isPending),
    failed: results.some((r) => r.isError),
    data: results.map((r) => r.data),
  };
}

/**
 * Recipes for the estimate described by `key` (from `costRecipesKey`); null when the estimate is
 * not recipe-based. Shares the catalog's recipe cache, so a recipe already on screen is costed
 * without another read.
 */
export function useCostRecipes(key: string | null): CostRecipesState {
  const entries = useMemo(() => (key ? parseKey(key) : []), [key]);
  const ids = useMemo(() => [...new Set(entries.map(([id]) => id))], [entries]);
  const details = useQueries({
    queries: ids.map((id) => ({
      queryKey: catalogKeys.recipe(id),
      queryFn: () => getRecipeDetail(id),
      staleTime: Infinity,
      gcTime: 30 * 60_000,
      networkMode: 'always' as const,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    })),
    combine: combineDetails,
  });

  return useMemo((): CostRecipesState => {
    if (key === null) return { status: 'loading' };
    if (details.failed) return { status: 'unavailable' };
    if (details.pending) return { status: 'loading' };
    const byId = new Map<string, RecipeDetail | null>();
    ids.forEach((id, index) => byId.set(id, details.data[index] ?? null));
    return buildCostRecipes(entries, byId);
  }, [key, details, ids, entries]);
}
