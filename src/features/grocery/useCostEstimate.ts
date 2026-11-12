/**
 * The cost estimate behind `<CostSummary/>`, for one recipe or for a shopping list.
 *
 * A recipe is turned into a one-recipe shopping list (scaled to the servings asked for) so both
 * cases are costed the same way: each item costs the share of a package it uses, staples and
 * pantry-covered items cost nothing, and items without a usable price are listed, not guessed.
 */
import { useMemo } from 'react';

import {
  buildShoppingList,
  estimateListCost,
  type CostEstimate,
  type ShoppingIngredient,
  type ShoppingItem,
  type ShoppingRecipe,
} from '@/domain/shopping';
import { useIngredients, useRecipe, type Ingredient, type RecipeDetail } from '@/lib/catalog';

import {
  buildCostDisplay,
  buildSourceRows,
  idsToBuy,
  toPriceRecords,
  type CostDisplay,
  type SourceRow,
} from './pricing';
import { usePrices, type UsePricesResult } from './usePrices';

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
    }
  | {
      readonly list: CostList;
      /** Servings the list feeds, for a per-serving figure; omit to show the total only. */
      readonly servings?: number | undefined;
      readonly recipeId?: undefined;
    };

export type CostEstimateState =
  | { readonly status: 'loading' }
  /** The recipe is not in the catalog or could not be read. */
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

/** The recipe as a planned shopping recipe, scaled to `servings` when given. */
export function toShoppingRecipe(recipe: RecipeDetail, servings?: number): ShoppingRecipe {
  const planned = servings !== undefined && servings > 0 ? servings : recipe.servings;
  return {
    recipeId: recipe.id,
    servings: recipe.servings,
    plannedServings: planned,
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

function sortedIds(ids: Iterable<string | null>): string[] {
  const set = new Set<string>();
  for (const id of ids) if (id) set.add(id);
  return [...set].sort();
}

export function useCostEstimate(source: CostSource): CostEstimateState {
  const recipeQuery = useRecipe(source.recipeId ?? null);
  const recipe = source.recipeId ? recipeQuery.data : undefined;
  const list = source.list;

  const lineIdsKey = useMemo(() => {
    if (list) {
      return sortedIds([...list.items, ...(list.inPantry ?? [])].map((i) => i.ingredientId)).join(
        ',',
      );
    }
    return recipe ? sortedIds(recipe.ingredients.map((l) => l.ingredientId)).join(',') : '';
  }, [list, recipe]);
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
  const servingsInput = source.servings;
  const shopping = useMemo((): CostList | null => {
    if (!ingredientsReady) return null;
    if (list) return list;
    if (!recipe) return null;
    const built = buildShoppingList({
      recipes: [toShoppingRecipe(recipe, servingsInput)],
      ingredients,
    });
    return { items: built.items };
  }, [ingredientsReady, list, recipe, ingredients, servingsInput]);

  const toBuy = useMemo(() => (shopping ? idsToBuy(shopping.items) : EMPTY_IDS), [shopping]);
  const prices = usePrices(toBuy, { enabled: shopping !== null });

  const servings = list
    ? servingsInput !== undefined && servingsInput > 0
      ? servingsInput
      : null
    : recipe
      ? servingsInput !== undefined && servingsInput > 0
        ? servingsInput
        : recipe.servings
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

  if (source.recipeId) {
    if (recipeQuery.isError || (recipeQuery.isSuccess && !recipeQuery.data)) {
      return { status: 'unavailable' };
    }
  }
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
