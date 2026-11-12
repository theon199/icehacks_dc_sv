/** Catalog lookups used by post cards, the weekly header and the compose recipe picker. */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { fetchWeeklyTopDishes } from '../api/communityApi';
import {
  getRecipeSummaries,
  listCookedRecipeIds,
  listSavedRecipeIds,
  searchRecipes,
  type RecipeSummary,
} from '../deps';
import { communityKeys } from './queryKeys';

/** The catalog never changes while the app runs, so lookups stay fresh for the session. */
const CATALOG_STALE_MS = Infinity;

export function useRecipeSummary(recipeId: string | null) {
  const query = useQuery({
    queryKey: communityKeys.recipes(recipeId ? [recipeId] : []),
    queryFn: () => getRecipeSummaries(recipeId ? [recipeId] : []),
    enabled: recipeId != null,
    staleTime: CATALOG_STALE_MS,
  });
  return query.data?.[0] ?? null;
}

export function useRecipeSearch(text: string) {
  const trimmed = text.trim();
  return useQuery({
    queryKey: communityKeys.recipeSearch(trimmed.toLowerCase()),
    queryFn: () => searchRecipes(trimmed),
    enabled: trimmed.length >= 2,
    staleTime: CATALOG_STALE_MS,
  });
}

export interface MyRecipes {
  saved: RecipeSummary[];
  cooked: RecipeSummary[];
}

/** The person's saved and cooked recipes, for quick picking in compose. */
export function useMyRecipes() {
  return useQuery({
    queryKey: communityKeys.myRecipes(),
    queryFn: async (): Promise<MyRecipes> => {
      const [savedIds, cookedIds] = await Promise.all([
        listSavedRecipeIds(),
        listCookedRecipeIds().catch(() => [] as string[]),
      ]);
      const summaries = await getRecipeSummaries([...savedIds, ...cookedIds]);
      const byId = new Map(summaries.map((summary) => [summary.id, summary]));
      const pick = (ids: string[]) =>
        ids.flatMap((id) => {
          const summary = byId.get(id);
          return summary ? [summary] : [];
        });
      return { saved: pick(savedIds), cooked: pick(cookedIds) };
    },
  });
}

export interface WeeklyTopDish {
  recipe: RecipeSummary;
  cooks: number;
  avgRating: number | null;
}

/** This week's most-cooked dishes that exist in the bundled catalog. */
export function useWeeklyTopDishes() {
  const query = useQuery({
    queryKey: communityKeys.weeklyTop(),
    queryFn: async (): Promise<WeeklyTopDish[]> => {
      const rows = await fetchWeeklyTopDishes(5);
      const summaries = await getRecipeSummaries(rows.map((row) => row.recipe_ref));
      const byId = new Map(summaries.map((summary) => [summary.id, summary]));
      return rows.flatMap((row) => {
        const recipe = byId.get(row.recipe_ref);
        return recipe ? [{ recipe, cooks: row.cooks, avgRating: row.avg_rating }] : [];
      });
    },
    staleTime: 10 * 60_000,
  });
  return useMemo(() => query.data ?? [], [query.data]);
}
