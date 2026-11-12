/**
 * React Query hooks over the catalog. The catalog ships inside the build and never changes while
 * it runs, so results never go stale and queries run offline (`networkMode: 'always'`).
 */
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  type QueryClient,
} from '@tanstack/react-query';

import {
  getCatalogMeta,
  getCuisines,
  getIngredients,
  getRecipeDetail,
  getRecipeSummaries,
  getSubstitutions,
  listCandidates,
  searchIngredients,
  searchRecipes,
} from './queries';
import { tokenize } from './searchQuery';
import type { CandidateFilters, SearchFilters, SubstitutionGoal } from './types';
import { isCatalogError } from '../db/catalog';

/** Retries a failed read once, unless the catalog is missing or from another schema. */
function retryCatalog(failureCount: number, error: unknown): boolean {
  if (isCatalogError(error) && error.kind !== 'query_failed') return false;
  return failureCount < 1;
}

const catalogQueryOptions = {
  staleTime: Infinity,
  gcTime: 30 * 60_000,
  networkMode: 'always',
  retry: retryCatalog,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;

/** Cache keys; normalised so equivalent inputs share one cache entry. */
export const catalogKeys = {
  all: ['catalog'] as const,
  recipe: (id: string) => ['catalog', 'recipe', id] as const,
  recipes: (ids: readonly string[]) => ['catalog', 'recipes', [...ids]] as const,
  search: (query: string, filters: SearchFilters) =>
    ['catalog', 'search', tokenize(query).join(' '), filters] as const,
  candidates: (filters: CandidateFilters) => ['catalog', 'candidates', filters] as const,
  ingredients: (ids: readonly string[]) => ['catalog', 'ingredients', [...ids]] as const,
  ingredientSearch: (text: string) =>
    ['catalog', 'ingredient-search', tokenize(text).join(' ')] as const,
  substitutions: (ids: readonly string[], goals: readonly SubstitutionGoal[] | undefined) =>
    ['catalog', 'substitutions', [...ids], goals ? [...goals] : null] as const,
  cuisines: ['catalog', 'cuisines'] as const,
  meta: ['catalog', 'meta'] as const,
};

/** Full recipe (ingredients, steps, tutorials). `data` is null for an unknown id. */
export function useRecipe(id: string | null | undefined) {
  return useQuery({
    ...catalogQueryOptions,
    queryKey: catalogKeys.recipe(id ?? ''),
    queryFn: () => getRecipeDetail(id ?? ''),
    enabled: !!id,
  });
}

/** Summaries for a list of ids, in the same order; unknown ids are left out. */
export function useRecipes(ids: readonly string[]) {
  return useQuery({
    ...catalogQueryOptions,
    queryKey: catalogKeys.recipes(ids),
    queryFn: () => getRecipeSummaries(ids),
    enabled: ids.length > 0,
    placeholderData: keepPreviousData,
  });
}

/** Paged full-text search. Keeps showing the previous results while a new query loads. */
export function useRecipeSearch(query: string, filters: SearchFilters = {}) {
  return useInfiniteQuery({
    ...catalogQueryOptions,
    queryKey: catalogKeys.search(query, filters),
    queryFn: ({ pageParam }) => searchRecipes(query, filters, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

/** Coarsely filtered recommendation candidates, for ranking in the domain layer. */
export function useCandidates(filters: CandidateFilters, options: { enabled?: boolean } = {}) {
  return useQuery({
    ...catalogQueryOptions,
    queryKey: catalogKeys.candidates(filters),
    queryFn: () => listCandidates(filters),
    enabled: options.enabled ?? true,
  });
}

export function useIngredients(ids: readonly string[]) {
  return useQuery({
    ...catalogQueryOptions,
    queryKey: catalogKeys.ingredients(ids),
    queryFn: () => getIngredients(ids),
    enabled: ids.length > 0,
  });
}

export function useIngredientSearch(text: string) {
  const normalized = tokenize(text).join(' ');
  return useQuery({
    ...catalogQueryOptions,
    queryKey: catalogKeys.ingredientSearch(text),
    queryFn: () => searchIngredients(normalized),
    enabled: normalized.length > 0,
    placeholderData: keepPreviousData,
  });
}

export function useSubstitutions(
  ingredientIds: readonly string[],
  goals?: readonly SubstitutionGoal[],
) {
  return useQuery({
    ...catalogQueryOptions,
    queryKey: catalogKeys.substitutions(ingredientIds, goals),
    queryFn: () => getSubstitutions(ingredientIds, goals),
    enabled: ingredientIds.length > 0,
  });
}

export function useCuisines() {
  return useQuery({ ...catalogQueryOptions, queryKey: catalogKeys.cuisines, queryFn: getCuisines });
}

export function useCatalogMeta() {
  return useQuery({ ...catalogQueryOptions, queryKey: catalogKeys.meta, queryFn: getCatalogMeta });
}

/** Warms the cache for a recipe the person is likely to open next (e.g. the next swipe card). */
export function prefetchRecipe(client: QueryClient, id: string): Promise<void> {
  return client.prefetchQuery({
    ...catalogQueryOptions,
    queryKey: catalogKeys.recipe(id),
    queryFn: () => getRecipeDetail(id),
  });
}
