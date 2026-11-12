/**
 * The shopping list for a range of days: planned meals from the plan store, their recipes and
 * ingredients from the catalog, minus what the pantry already covers.
 */
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';

import { dayIndexOf, weekStartOf } from '@/domain/plan';
import { catalogKeys, getRecipeDetail, useIngredients, type RecipeDetail } from '@/lib/catalog';
import { entryPortion, slotKey, useMealPlanStore, type PlanWeek } from '@/stores/mealPlan';
import { selectPantryItems, usePantryStore } from '@/stores/pantry';
import { selectSmallAppetite, usePreferencesStore } from '@/stores/preferences';

import { buildPlannedList, ingredientIdsOf, type ListRecipe, type PlannedList } from './buildList';
import { plannedMealsInRange, recipeIdsOf, type DateRange, type PlannedMealRef } from './planRange';

/**
 * Planned meals with each one's portion folded into its servings, so the list buys what will be
 * cooked: two half-portion servings need as much as one whole serving. The portion is the one the
 * meal was planned at, or the small-appetite setting's for a meal planned without one.
 */
export function portionedMeals(
  meals: readonly PlannedMealRef[],
  weeks: Readonly<Record<string, PlanWeek>>,
  smallAppetite: boolean,
): PlannedMealRef[] {
  return meals.map((meal) => {
    const entry = weeks[weekStartOf(meal.date)]?.slots[slotKey(dayIndexOf(meal.date), meal.meal)];
    const portion = entryPortion(entry ?? {}, meal.meal, smallAppetite);
    return portion === 1 ? meal : { ...meal, servings: meal.servings * portion };
  });
}

// The catalog ships with the app and never changes while it runs.
const recipeQueryOptions = {
  staleTime: Infinity,
  gcTime: 30 * 60_000,
  networkMode: 'always',
  retry: 1,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;

export type ShoppingListStatus = 'empty' | 'loading' | 'error' | 'ready';

export interface ShoppingListResult {
  readonly status: ShoppingListStatus;
  readonly list: PlannedList | null;
  readonly plannedMeals: number;
  readonly error: unknown;
  readonly retry: () => void;
}

interface RecipeLoad {
  readonly recipes: ReadonlyMap<string, ListRecipe>;
  readonly pending: boolean;
  readonly error: unknown;
  readonly refetch: () => void;
}

type RecipeResult = UseQueryResult<RecipeDetail | null>;

// Module-level so react-query can keep the combined value stable between renders.
function combineRecipes(results: RecipeResult[]): RecipeLoad {
  const recipes = new Map<string, ListRecipe>();
  for (const result of results) {
    if (result.data) recipes.set(result.data.id, result.data);
  }
  const failed = results.find((result) => result.isError);
  return {
    recipes,
    pending: results.some((result) => result.isPending),
    error: failed?.error ?? null,
    refetch: () => {
      for (const result of results) if (result.isError) void result.refetch();
    },
  };
}

function useRecipeDetails(ids: readonly string[]): RecipeLoad {
  return useQueries({
    queries: ids.map((id) => ({
      ...recipeQueryOptions,
      queryKey: catalogKeys.recipe(id),
      queryFn: () => getRecipeDetail(id),
    })),
    combine: combineRecipes,
  });
}

export function useShoppingList(range: DateRange): ShoppingListResult {
  const weeks = useMealPlanStore((state) => state.weeks);
  const pantry = usePantryStore(selectPantryItems);
  const smallAppetite = usePreferencesStore(selectSmallAppetite);

  const meals = useMemo(() => plannedMealsInRange(weeks, range), [weeks, range]);
  const recipeIds = useMemo(() => recipeIdsOf(meals), [meals]);
  const details = useRecipeDetails(recipeIds);

  const ingredientIds = useMemo(() => ingredientIdsOf(details.recipes.values()), [details.recipes]);
  const ingredients = useIngredients(ingredientIds);

  const ingredientsReady = ingredientIds.length === 0 || ingredients.data !== undefined;
  const list = useMemo(() => {
    if (meals.length === 0 || details.pending || !ingredientsReady) return null;
    return buildPlannedList({
      meals: portionedMeals(meals, weeks, smallAppetite),
      recipes: details.recipes,
      ingredients: ingredients.data ?? [],
      pantry,
      // Each meal's portion is already in its servings.
      portion: 1,
    });
  }, [meals, weeks, details, ingredientsReady, ingredients.data, pantry, smallAppetite]);

  const error = details.error ?? ingredients.error;
  const status: ShoppingListStatus =
    meals.length === 0 ? 'empty' : error ? 'error' : list ? 'ready' : 'loading';

  return {
    status,
    list,
    plannedMeals: meals.length,
    error,
    retry: () => {
      details.refetch();
      if (ingredients.isError) void ingredients.refetch();
    },
  };
}
