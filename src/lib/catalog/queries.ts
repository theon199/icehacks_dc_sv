import { z } from 'zod';

import { CATALOG_STALE_TIME, readCatalog } from './api';
import { LruCache } from './lru';
import {
  candidateRowSchema,
  ingredientLineRowSchema,
  ingredientRowSchema,
  metaRowSchema,
  recipeRowSchema,
  stepRowSchema,
  substitutionRowSchema,
  toCatalogMeta,
  toIngredient,
  toIngredientLine,
  toRecipeCandidate,
  toRecipeSummary,
  toStep,
  toSubstitution,
  toTutorial,
  tutorialRowSchema,
} from './rows';
import { buildFtsQuery, expandQuery, phraseAlternatives, tokenize } from './searchQuery';
import type {
  AllergenId,
  CandidateFilters,
  CatalogMeta,
  Course,
  CuisineInfo,
  GoalTag,
  Ingredient,
  RecipeCandidate,
  RecipeDetail,
  RecipeSummary,
  SearchFilters,
  SearchPage,
  Substitution,
  SubstitutionGoal,
} from './types';
import type { Json } from '../supabase/database.types';

export const SEARCH_PAGE_SIZE = 30;
const MAX_CANDIDATES = 2000;
const INGREDIENT_SEARCH_LIMIT = 20;

// The catalog is stored on Supabase. These short-lived caches stay in memory only.
const summaryCache = new LruCache<string, RecipeSummary>(600, CATALOG_STALE_TIME);
const detailCache = new LruCache<string, RecipeDetail>(40, CATALOG_STALE_TIME);
const ingredientCache = new LruCache<string, Ingredient>(400, CATALOG_STALE_TIME);

/** Forgets cached reads. */
export function clearCatalogCaches(): void {
  summaryCache.clear();
  detailCache.clear();
  ingredientCache.clear();
}

const list = (values: readonly string[] | undefined): string[] | undefined =>
  values?.length ? [...new Set(values)] : undefined;

const finite = (value: number | undefined): number | undefined =>
  Number.isFinite(value) ? value : undefined;

interface FilterValues {
  dietMask?: number | undefined;
  cuisines?: readonly string[] | undefined;
  course?: Course | readonly Course[] | undefined;
  maxMinutes?: number | undefined;
  maxKcal?: number | undefined;
  gentle?: boolean | undefined;
  avoidAllergens?: readonly AllergenId[] | undefined;
  goals?: readonly GoalTag[] | undefined;
  excludeIds?: readonly string[] | undefined;
}

function recipeFilters(f: FilterValues): Record<string, Json | undefined> {
  const mask = finite(f.dietMask);
  return {
    diet: mask != null && mask > 0 ? Math.trunc(mask) : undefined,
    cuisines: list(f.cuisines),
    courses: typeof f.course === 'string' ? [f.course] : list(f.course),
    max_minutes: finite(f.maxMinutes),
    max_kcal: finite(f.maxKcal),
    gentle: f.gentle || undefined,
    avoid_allergens: list(f.avoidAllergens),
    goals: list(f.goals),
    exclude_ids: list(f.excludeIds),
  };
}

const recipeRows = z.array(recipeRowSchema);
const ingredientRows = z.array(ingredientRowSchema);

/**
 * Looks up many ids at once, in the order asked, skipping unknown ids. Results are gathered in a
 * map owned by this call; the LRU only saves a query for ids it still holds, so a batch larger
 * than the cache, or one whose cached entries get evicted by its own fresh rows, loses nothing.
 */
async function lookupMany<T>(
  ids: readonly string[],
  cache: LruCache<string, T>,
  fetchMissing: (missing: readonly string[]) => Promise<(readonly [string, T])[]>,
): Promise<T[]> {
  const found = new Map<string, T>();
  const missing: string[] = [];
  for (const id of new Set(ids)) {
    const cached = cache.get(id);
    if (cached !== undefined) found.set(id, cached);
    else missing.push(id);
  }
  if (missing.length > 0) {
    for (const [id, value] of await fetchMissing(missing)) {
      found.set(id, value);
      cache.set(id, value);
    }
  }
  const out: T[] = [];
  for (const id of ids) {
    const value = found.get(id);
    if (value !== undefined) out.push(value);
  }
  return out;
}

/** Summaries for many ids in one statement, in the order asked; unknown ids are skipped. */
export function getRecipeSummaries(ids: readonly string[]): Promise<RecipeSummary[]> {
  return lookupMany(ids, summaryCache, async (missing) => {
    const rows = await Promise.all(
      Array.from({ length: Math.ceil(missing.length / MAX_CANDIDATES) }, (_, index) => {
        const batch = missing.slice(index * MAX_CANDIDATES, (index + 1) * MAX_CANDIDATES);
        return readCatalog('catalog_recipes', { p_ids: batch, p_limit: batch.length }, recipeRows);
      }),
    );
    return rows.flat().map((row) => [row.id, toRecipeSummary(row)] as const);
  });
}

export async function getRecipeSummary(id: string): Promise<RecipeSummary | null> {
  const [summary] = await getRecipeSummaries([id]);
  return summary ?? null;
}

/** Coarse server filtering, followed by scoring and diversity in the domain layer. */
export async function listCandidates(filters: CandidateFilters): Promise<RecipeCandidate[]> {
  const limit = Math.min(Math.max(Math.trunc(finite(filters.limit) ?? 1), 1), MAX_CANDIDATES);
  const rows = await readCatalog(
    'catalog_recipes',
    {
      p_filters: {
        ...recipeFilters({ ...filters, dietMask: filters.dietMask ?? filters.excludeDietMask }),
        pantry_ids: filters.pantry ? [...filters.pantry.ingredientIds] : undefined,
        min_coverage: filters.pantry?.minCoverage,
      },
      p_limit: limit,
    },
    z.array(candidateRowSchema),
  );
  return rows.map(toRecipeCandidate);
}

/** Safety filters a family lookup accepts; a `CandidateFilters` object fits as is. */
export type FamilyFilters = Pick<CandidateFilters, 'dietMask' | 'avoidAllergens'>;

/**
 * Every version of one dish (the recipes sharing `familyId`), healthiest first. The safety filters
 * apply the same fail-closed rules as `listCandidates`, so an unsafe version is never read. They
 * are required so every caller decides what to screen; `{}` asks for the family unscreened.
 */
export async function getRecipesByFamily(
  familyId: string,
  filters: FamilyFilters,
): Promise<RecipeSummary[]> {
  const rows = await readCatalog(
    'catalog_recipes',
    { p_family_id: familyId, p_filters: recipeFilters(filters), p_limit: MAX_CANDIDATES },
    recipeRows,
  );
  return rows.map((row) => {
    const summary = toRecipeSummary(row);
    summaryCache.set(summary.id, summary);
    return summary;
  });
}

/** Ingredients most kitchens keep on hand, by category then name. */
export async function getPantryStaples(): Promise<Ingredient[]> {
  const rows = await readCatalog('catalog_ingredients', { p_staples_only: true }, ingredientRows);
  return rows.map(toIngredient);
}

const detailSchema = z
  .object({
    recipe: recipeRowSchema,
    ingredients: z.array(ingredientLineRowSchema),
    steps: z.array(stepRowSchema),
    tutorials: z.array(tutorialRowSchema),
  })
  .nullable();

/** Everything needed by the recipe screen and cook mode, or null for an unknown id. */
export async function getRecipeDetail(id: string): Promise<RecipeDetail | null> {
  const cached = detailCache.get(id);
  if (cached) return cached;
  const row = await readCatalog('catalog_recipe_detail', { p_id: id }, detailSchema);
  if (!row) return null;
  const summary = toRecipeSummary(row.recipe);
  const detail: RecipeDetail = {
    ...summary,
    ingredients: row.ingredients.map(toIngredientLine),
    steps: row.steps.map(toStep),
    tutorials: row.tutorials.map(toTutorial),
  };
  summaryCache.set(id, summary);
  detailCache.set(id, detail);
  return detail;
}

function searchFilterValues(filters: SearchFilters): FilterValues {
  return {
    dietMask: filters.dietMask,
    cuisines: filters.cuisines,
    course: filters.course,
    maxMinutes: filters.maxMinutes,
    maxKcal: filters.maxKcal,
    avoidAllergens: filters.avoidAllergens,
    goals: filters.goals,
  };
}

/**
 * Full-text search ranked by PostgreSQL (title weighs most, then cuisine, then ingredients), with
 * synonyms and prefix matching. An empty query browses the filtered catalog by health score.
 * `cursor` is the offset returned as `nextCursor` by the previous page.
 */
export async function searchRecipes(
  query: string,
  filters: SearchFilters = {},
  cursor: number | null = 0,
): Promise<SearchPage> {
  const offset = Math.max(0, Math.trunc(finite(cursor ?? 0) ?? 0));
  const match = buildFtsQuery(query);
  const rows = await readCatalog(
    'catalog_recipes',
    {
      p_filters: recipeFilters(searchFilterValues(filters)),
      ...(match ? { p_query: match } : {}),
      p_limit: SEARCH_PAGE_SIZE + 1,
      p_offset: offset,
    },
    recipeRows,
    expandQuery(query),
  );
  const items = rows.slice(0, SEARCH_PAGE_SIZE).map((row) => {
    const summary = toRecipeSummary(row);
    summaryCache.set(summary.id, summary);
    return summary;
  });
  return {
    items,
    nextCursor: rows.length > SEARCH_PAGE_SIZE ? offset + SEARCH_PAGE_SIZE : null,
  };
}

/** Ingredients for the given ids, in the order asked; unknown ids are skipped. */
export function getIngredients(ids: readonly string[]): Promise<Ingredient[]> {
  return lookupMany(ids, ingredientCache, async (missing) => {
    const rows = await readCatalog('catalog_ingredients', { p_ids: [...missing] }, ingredientRows);
    return rows.map((row) => [row.id, toIngredient(row)] as const);
  });
}

function ingredientRank(ingredient: Ingredient, phrases: readonly string[]): number {
  const names = [ingredient.name, ingredient.plural ?? '', ingredient.id.replace(/_/g, ' ')].map(
    (name) => tokenize(name).join(' '),
  );
  let best = 4;
  for (const phrase of phrases) {
    for (const name of names) {
      if (!name) continue;
      if (name === phrase) best = Math.min(best, 0);
      else if (name.startsWith(phrase)) best = Math.min(best, 1);
      else if (name.split(' ').some((word) => word.startsWith(phrase))) best = Math.min(best, 2);
      else if (name.includes(phrase)) best = Math.min(best, 3);
    }
  }
  return best;
}

/** Ingredients whose name contains the text (synonyms included), best matches first. */
export async function searchIngredients(text: string): Promise<Ingredient[]> {
  const phrases = phraseAlternatives(text);
  if (phrases.length === 0) return [];
  const rows = await readCatalog('catalog_ingredients', { p_phrases: phrases }, ingredientRows);
  return rows
    .map((row) => {
      const ingredient = toIngredient(row);
      ingredientCache.set(ingredient.id, ingredient);
      return { ingredient, rank: ingredientRank(ingredient, phrases) };
    })
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.ingredient.name.length - b.ingredient.name.length ||
        a.ingredient.name.localeCompare(b.ingredient.name),
    )
    .slice(0, INGREDIENT_SEARCH_LIMIT)
    .map((entry) => entry.ingredient);
}

/** Swaps for the given ingredients, optionally limited to some goals. */
export async function getSubstitutions(
  ingredientIds: readonly string[],
  goals?: readonly SubstitutionGoal[],
): Promise<Substitution[]> {
  const ids = list(ingredientIds);
  if (!ids) return [];
  const goalList = list(goals);
  const rows = await readCatalog(
    'catalog_substitutions',
    { p_ids: ids, ...(goalList ? { p_goals: goalList } : {}) },
    z.array(substitutionRowSchema),
  );
  return rows.map(toSubstitution);
}

const cuisineRowSchema = z.object({
  cuisine: z.string(),
  region: z.string(),
  recipe_count: z.number(),
});

/** Every cuisine with its region and recipe count, most common first. */
export async function getCuisines(): Promise<CuisineInfo[]> {
  const rows = await readCatalog('catalog_cuisines', {}, z.array(cuisineRowSchema));
  return rows.map((row) => ({
    cuisine: row.cuisine,
    region: row.region,
    recipeCount: row.recipe_count,
  }));
}

/** Build information for the imported catalog. */
export async function getCatalogMeta(): Promise<CatalogMeta> {
  return toCatalogMeta(await readCatalog('catalog_meta', {}, z.array(metaRowSchema)));
}
