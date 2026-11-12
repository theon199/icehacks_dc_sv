/**
 * The cost estimate behind `<CostSummary/>`, for one recipe, several recipes (a planned week) or
 * a shopping list.
 *
 * Recipes are turned into a shopping list (each scaled to the servings asked for) so every case
 * is costed the same way: each item costs the share of a package it uses, staples and
 * pantry-covered items cost nothing, optional items without an amount are not counted, and items
 * without a usable price are listed, not guessed.
 */
import { useMemo } from 'react';

import {
  buildShoppingList,
  estimateListCost,
  type CostEstimate,
  type ShoppingIngredient,
  type ShoppingItem,
} from '@/domain/shopping';
import { useIngredients, type Ingredient } from '@/lib/catalog';

import {
  buildCostDisplay,
  buildSourceRows,
  idsToBuy,
  itemsToCost,
  toPriceRecords,
  type CostDisplay,
  type SourceRow,
} from './pricing';
import { costRecipesKey, useCostRecipes, type CostRecipe } from './useCostRecipes';
import { usePrices, type UsePricesResult } from './usePrices';

export { toShoppingRecipe, type CostRecipe } from './useCostRecipes';

/** A shopping list as `buildShoppingList` returns it. */
export interface CostList {
  readonly items: readonly ShoppingItem[];
  /** Items the pantry covers; costed at zero. */
  readonly inPantry?: readonly ShoppingItem[] | undefined;
}

export type CostSource =
  | {
      readonly recipeId: string;
      /** Servings to cost for; defaults to the recipe's own yield. */
      readonly servings?: number | undefined;
      readonly list?: undefined;
      readonly recipes?: undefined;
    }
  | {
      /**
       * Several recipes costed as one shopping trip, each for its own servings (its yield when
       * omitted). The per-serving figure divides by the servings of all of them together.
       */
      readonly recipes: readonly CostRecipe[];
      readonly recipeId?: undefined;
      readonly list?: undefined;
      readonly servings?: undefined;
    }
  | {
      readonly list: CostList;
      /** Servings the list feeds, for a per-serving figure; omit to show the total only. */
      readonly servings?: number | undefined;
      readonly recipeId?: undefined;
      readonly recipes?: undefined;
    };

export type CostEstimateState =
  | { readonly status: 'loading' }
  /** The recipes are not in the catalog or could not be read. */
  | { readonly status: 'unavailable' }
  | {
      readonly status: 'ready';
      readonly estimate: CostEstimate;
      readonly display: CostDisplay;
      readonly sources: readonly SourceRow[];
      /** Ingredient ids that need buying, sorted. */
      readonly idsToBuy: readonly string[];
      /** Display name per ingredient id. */
      readonly names: Readonly<Record<string, string>>;
      /** Servings the per-serving figure divides by, if any. */
      readonly servings: number | null;
      readonly prices: UsePricesResult;
    };

const EMPTY_IDS: readonly string[] = [];

function toShoppingIngredient(ingredient: Ingredient): ShoppingIngredient {
  return {
    id: ingredient.id,
    name: ingredient.name,
    plural: ingredient.plural,
    aisle: ingredient.aisle,
    pantry_staple: ingredient.pantryStaple,
    grams_per_unit: ingredient.gramsPerUnit,
  };
}

function sortedIds(ids: Iterable<string | null>): string[] {
  const set = new Set<string>();
  for (const id of ids) if (id) set.add(id);
  return [...set].sort();
}

/** The recipe entries a source names, as a stable key; null for a list. */
function recipesKeyOf(source: CostSource): string | null {
  if (source.list) return null;
  if (source.recipes) return costRecipesKey(source.recipes);
  return costRecipesKey([{ recipeId: source.recipeId, servings: source.servings }]);
}

export function useCostEstimate(source: CostSource): CostEstimateState {
  const list = source.list;
  const recipesState = useCostRecipes(recipesKeyOf(source));
  const recipes = recipesState.status === 'ready' ? recipesState.recipes : null;

  const lineIdsKey = useMemo(() => {
    if (list) {
      return sortedIds([...list.items, ...(list.inPantry ?? [])].map((i) => i.ingredientId)).join(
        ',',
      );
    }
    if (!recipes) return '';
    return sortedIds(recipes.flatMap((r) => r.ingredients.map((l) => l.ingredient_id))).join(',');
  }, [list, recipes]);
  const lineIds = useMemo(() => (lineIdsKey ? lineIdsKey.split(',') : EMPTY_IDS), [lineIdsKey]);
  const ingredientsQuery = useIngredients(lineIds);

  const ingredients = useMemo(() => {
    const map: Record<string, ShoppingIngredient> = {};
    for (const ingredient of ingredientsQuery.data ?? []) {
      map[ingredient.id] = toShoppingIngredient(ingredient);
    }
    return map;
  }, [ingredientsQuery.data]);

  const ingredientsReady = lineIds.length === 0 || ingredientsQuery.data !== undefined;
  const shopping = useMemo((): CostList | null => {
    if (!ingredientsReady) return null;
    if (list) return { items: itemsToCost(list.items), inPantry: list.inPantry };
    if (!recipes) return null;
    return { items: itemsToCost(buildShoppingList({ recipes, ingredients }).items) };
  }, [ingredientsReady, list, recipes, ingredients]);

  const toBuy = useMemo(() => (shopping ? idsToBuy(shopping.items) : EMPTY_IDS), [shopping]);
  const prices = usePrices(toBuy, { enabled: shopping !== null });

  const listServings =
    source.servings !== undefined && Number.isFinite(source.servings) && source.servings > 0
      ? source.servings
      : null;
  const servings = list
    ? listServings
    : recipesState.status === 'ready' && recipesState.servings > 0
      ? recipesState.servings
      : null;

  const names = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [id, info] of Object.entries(ingredients)) out[id] = info.name;
    return out;
  }, [ingredients]);

  const costed = useMemo(() => {
    if (!shopping) return null;
    const estimate = estimateListCost({
      items: shopping.items,
      inPantry: shopping.inPantry,
      ingredients,
      prices: toPriceRecords(prices.prices),
    });
    return {
      estimate,
      display: buildCostDisplay({
        estimate,
        servings,
        prices: prices.prices,
        lookupStopped: prices.lookupStopped,
      }),
      sources: buildSourceRows(estimate, prices.prices, names),
    };
  }, [shopping, ingredients, prices.prices, prices.lookupStopped, servings, names]);

  if (!list && recipesState.status === 'unavailable') return { status: 'unavailable' };
  if (ingredientsQuery.isError) return { status: 'unavailable' };
  if (!costed) return { status: 'loading' };
  return {
    status: 'ready',
    ...costed,
    idsToBuy: toBuy,
    names,
    servings,
    prices,
  };
}
