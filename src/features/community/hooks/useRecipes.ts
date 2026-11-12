/** Catalog lookups used by post cards, the weekly header and the compose recipe picker. */
import { keepPreviousData, useQuery, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { isRecipeSafe, type SafetyRules } from '@/domain/safety';

import { fetchWeeklyTopDishes } from '../api/communityApi';
import {
  getRecipeSummaries,
  searchRecipes,
  useCookedRecipeIds,
  useSafetyRules,
  useSavedRecipeIds,
  type CatalogRecipe,
  type RecipeSummary,
} from '../deps';
import { communityKeys, useViewer } from './queryKeys';
import { pickerLookupIds } from '../logic/myRecipes';

/** The catalog never changes while the app runs, so lookups stay fresh for the session. */
const CATALOG_STALE_MS = Infinity;

/**
 * Looks up every recipe a batch of posts links to in one catalog query and seeds the per-recipe
 * cache entries that `useRecipeSummary` reads, so a page of post cards does not run one query per
 * card. A failed lookup is ignored: each chip then falls back to its own query.
 */
export async function primeRecipeSummaries(
  client: QueryClient,
  recipeIds: readonly string[],
): Promise<void> {
  const missing = [...new Set(recipeIds)].filter(
    (id) => id.length > 0 && client.getQueryData(communityKeys.recipes([id])) === undefined,
  );
  if (missing.length === 0) return;
  let found: RecipeSummary[];
  try {
    found = await getRecipeSummaries(missing);
  } catch {
    return;
  }
  const byId = new Map(found.map((summary) => [summary.id, summary]));
  for (const id of missing) {
    const summary = byId.get(id);
    client.setQueryData<RecipeSummary[]>(communityKeys.recipes([id]), summary ? [summary] : []);
  }
}

export interface RecipeSummaryLookup {
  recipe: RecipeSummary | null;
  /** True while the lookup is still running; false once it answered (found or not) or failed. */
  loading: boolean;
}

/** One catalog recipe by id, with whether the lookup has finished. */
export function useRecipeLookup(recipeId: string | null): RecipeSummaryLookup {
  const query = useQuery<RecipeSummary[]>({
    queryKey: communityKeys.recipes(recipeId ? [recipeId] : []),
    queryFn: () => getRecipeSummaries(recipeId ? [recipeId] : []),
    enabled: recipeId != null,
    staleTime: CATALOG_STALE_MS,
  });
  return {
    recipe: query.data?.[0] ?? null,
    loading: recipeId != null && query.isPending && query.fetchStatus !== 'idle',
  };
}

export function useRecipeSummary(recipeId: string | null): RecipeSummary | null {
  return useRecipeLookup(recipeId).recipe;
}

export function useRecipeSearch(text: string) {
  const trimmed = text.trim();
  return useQuery<RecipeSummary[]>({
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

/** How many recipes each picker section can show. */
export const PICKER_SECTION_LIMIT = 6;
/** Looked up per section; a little over what is shown, in case some ids left the catalog. */
const PICKER_LOOKUP_PER_SECTION = PICKER_SECTION_LIMIT * 2;

function pick(ids: readonly string[], byId: ReadonlyMap<string, RecipeSummary>): RecipeSummary[] {
  return ids.flatMap((id) => {
    const summary = byId.get(id);
    return summary ? [summary] : [];
  });
}

/**
 * The person's saved and recently cooked recipes, for quick picking in compose. Both lists come
 * from the local stores, so they update as soon as something is saved or cooked.
 */
export function useMyRecipes() {
  const savedIds = useSavedRecipeIds();
  const cookedIds = useCookedRecipeIds();
  const lookupIds = useMemo(
    () => pickerLookupIds(savedIds, cookedIds, PICKER_LOOKUP_PER_SECTION),
    [cookedIds, savedIds],
  );
  const query = useQuery<RecipeSummary[]>({
    queryKey: communityKeys.recipes(lookupIds),
    queryFn: () => getRecipeSummaries(lookupIds),
    staleTime: CATALOG_STALE_MS,
    placeholderData: keepPreviousData,
  });
  const data = useMemo<MyRecipes>(() => {
    const byId = new Map((query.data ?? []).map((summary) => [summary.id, summary]));
    return { saved: pick(savedIds, byId), cooked: pick(cookedIds, byId) };
  }, [cookedIds, query.data, savedIds]);
  return { data, isPending: query.isPending };
}

export interface WeeklyTopDish {
  recipe: RecipeSummary;
  cooks: number;
  avgRating: number | null;
}

interface RankedDish {
  recipe: CatalogRecipe;
  cooks: number;
  avgRating: number | null;
}

/** Dishes shown in the strip. */
export const WEEKLY_TOP_SHOWN = 5;
/** Asked from the server: enough that the strip stays full after the safety filter. */
const WEEKLY_TOP_FETCHED = 20;

/** Keeps dishes that are safe for the person, in rank order, up to the strip's size. */
export function safeTopDishes(ranked: readonly RankedDish[], rules: SafetyRules): WeeklyTopDish[] {
  if (!rules.answered) return [];
  const out: WeeklyTopDish[] = [];
  for (const dish of ranked) {
    if (out.length >= WEEKLY_TOP_SHOWN) break;
    if (isRecipeSafe(dish.recipe, rules)) out.push(dish);
  }
  return out;
}

/**
 * This week's most-cooked dishes that exist in the bundled catalog and are safe for the person.
 * Same fail-closed rule as everywhere else: a dish whose allergen status is not verified free for
 * a declared allergen is left out, and nothing is shown until the allergen question is answered.
 */
export function useWeeklyTopDishes(): WeeklyTopDish[] {
  const viewer = useViewer();
  const rules = useSafetyRules();
  const query = useQuery({
    queryKey: communityKeys.weeklyTop(viewer),
    queryFn: async (): Promise<RankedDish[]> => {
      const rows = await fetchWeeklyTopDishes(WEEKLY_TOP_FETCHED);
      const summaries = await getRecipeSummaries(rows.map((row) => row.recipe_ref));
      const byId = new Map(summaries.map((summary) => [summary.id, summary]));
      return rows.flatMap((row) => {
        const recipe = byId.get(row.recipe_ref);
        return recipe ? [{ recipe, cooks: row.cooks, avgRating: row.avg_rating }] : [];
      });
    },
    enabled: rules.answered,
    staleTime: 10 * 60_000,
  });
  return useMemo(() => safeTopDishes(query.data ?? [], rules), [query.data, rules]);
}
