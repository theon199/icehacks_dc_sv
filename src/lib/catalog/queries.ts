/**
 * Typed queries over the bundled catalog. Every statement has fixed SQL text (lists are bound as
 * one JSON array and expanded with `json_each`), so each runs through a cached prepared statement.
 * The catalog is immutable for the life of a build, which makes the small LRU caches here safe.
 */
import type { SQLiteBindValue } from 'expo-sqlite';
import { z } from 'zod';

import { catalogPreparedQuery, isCatalogError } from '../db/catalog';
import { logger } from '../logger';
import { LruCache } from './lru';
import {
  candidateRowSchema,
  INGREDIENT_COLUMNS,
  ingredientLineRowSchema,
  ingredientRowSchema,
  metaRowSchema,
  RECIPE_SUMMARY_COLUMNS,
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
import { buildFtsQuery, escapeLike, phraseAlternatives, tokenize } from './searchQuery';
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

export const SEARCH_PAGE_SIZE = 30;
const MAX_CANDIDATES = 2000;
const INGREDIENT_SEARCH_LIMIT = 20;

const summaryCache = new LruCache<string, RecipeSummary>(600);
const detailCache = new LruCache<string, RecipeDetail>(40);
const ingredientCache = new LruCache<string, Ingredient>(400);
let cuisinesPromise: Promise<CuisineInfo[]> | null = null;
let metaPromise: Promise<CatalogMeta> | null = null;

/** Forgets every cached result (tests, or after the catalog file is replaced). */
export function clearCatalogCaches(): void {
  summaryCache.clear();
  detailCache.clear();
  ingredientCache.clear();
  cuisinesPromise = null;
  metaPromise = null;
}

const jsonList = (values: readonly string[] | undefined): string | null =>
  values && values.length > 0 ? JSON.stringify([...new Set(values)]) : null;

const courseList = (course: Course | readonly Course[] | undefined): string | null =>
  course == null ? null : jsonList(typeof course === 'string' ? [course] : course);

const finiteOrNull = (value: number | undefined): number | null =>
  value != null && Number.isFinite(value) ? value : null;

/**
 * Shared WHERE clauses. Each clause is disabled by binding NULL (or 0) to its first parameter, so
 * the SQL text never changes with the filters in use.
 */
const FILTER_SQL = `
  AND (? IS NULL OR (r.diet_flags & ?) = ?)
  AND (? IS NULL OR r.cuisine IN (SELECT value FROM json_each(?)))
  AND (? IS NULL OR r.course IN (SELECT value FROM json_each(?)))
  AND (? IS NULL OR (r.total_minutes IS NOT NULL AND r.total_minutes <= ?))
  AND (? IS NULL OR (r.kcal IS NOT NULL AND r.kcal <= ?))
  AND (? = 0 OR r.gentle = 1)
  AND (? IS NULL OR NOT EXISTS (
    SELECT 1 FROM json_each(?) a
    WHERE json_extract(r.allergens, '$.' || a.value) IS NOT 'free'))
  AND (? IS NULL OR NOT EXISTS (
    SELECT 1 FROM json_each(?) g
    WHERE NOT EXISTS (SELECT 1 FROM json_each(r.goal_tags) t WHERE t.value = g.value)))
  AND (? IS NULL OR r.id NOT IN (SELECT value FROM json_each(?)))`;

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

function filterParams(f: FilterValues): SQLiteBindValue[] {
  const mask = f.dietMask != null && f.dietMask > 0 ? Math.trunc(f.dietMask) : null;
  const cuisines = jsonList(f.cuisines);
  const courses = courseList(f.course);
  const maxMinutes = finiteOrNull(f.maxMinutes);
  const maxKcal = finiteOrNull(f.maxKcal);
  const allergens = jsonList(f.avoidAllergens);
  const goals = jsonList(f.goals);
  const excluded = jsonList(f.excludeIds);
  return [
    mask,
    mask,
    mask,
    cuisines,
    cuisines,
    courses,
    courses,
    maxMinutes,
    maxMinutes,
    maxKcal,
    maxKcal,
    f.gentle ? 1 : 0,
    allergens,
    allergens,
    goals,
    goals,
    excluded,
    excluded,
  ];
}

const SUMMARY_BY_IDS_SQL = `SELECT ${RECIPE_SUMMARY_COLUMNS} FROM recipes r
  WHERE r.id IN (SELECT value FROM json_each(?))`;

/** Summaries for many ids in one statement, in the order asked; unknown ids are skipped. */
export async function getRecipeSummaries(ids: readonly string[]): Promise<RecipeSummary[]> {
  const missing = [...new Set(ids.filter((id) => !summaryCache.has(id)))];
  if (missing.length > 0) {
    const rows = await catalogPreparedQuery(
      SUMMARY_BY_IDS_SQL,
      [JSON.stringify(missing)],
      recipeRowSchema,
    );
    for (const row of rows) summaryCache.set(row.id, toRecipeSummary(row));
  }
  const out: RecipeSummary[] = [];
  for (const id of ids) {
    const summary = summaryCache.get(id);
    if (summary) out.push(summary);
  }
  return out;
}

export async function getRecipeSummary(id: string): Promise<RecipeSummary | null> {
  const [summary] = await getRecipeSummaries([id]);
  return summary ?? null;
}

const CANDIDATES_SQL = `SELECT ${RECIPE_SUMMARY_COLUMNS},
    (SELECT json_group_array(ri.ingredient_id) FROM recipe_ingredients ri
      WHERE ri.recipe_id = r.id AND ri.ingredient_id IS NOT NULL) AS ingredient_ids
  FROM recipes r
  WHERE 1 = 1 ${FILTER_SQL}
  ORDER BY r.health_score DESC, r.id
  LIMIT ?`;

/**
 * Lightweight candidates for ranking. SQL only does coarse filtering (diet, allergens fail-closed,
 * cuisine, course, time, gentle); scoring and diversity belong to the domain layer.
 */
export async function listCandidates(filters: CandidateFilters): Promise<RecipeCandidate[]> {
  const limit = Math.min(Math.max(Math.trunc(filters.limit), 1), MAX_CANDIDATES);
  const rows = await catalogPreparedQuery(
    CANDIDATES_SQL,
    [
      ...filterParams({
        dietMask: filters.dietMask ?? filters.excludeDietMask,
        cuisines: filters.cuisines,
        course: filters.course,
        maxMinutes: filters.maxMinutes,
        gentle: filters.gentle,
        avoidAllergens: filters.avoidAllergens,
        excludeIds: filters.excludeIds,
      }),
      limit,
    ],
    candidateRowSchema,
  );
  // Not added to the summary cache: a candidate list is up to 2,000 rows and would evict the
  // summaries screens actually show.
  return rows.map(toRecipeCandidate);
}

const INGREDIENT_LINES_SQL = `SELECT position, ingredient_id, text, quantity, unit, grams, section, optional
  FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position`;
const STEPS_SQL = `SELECT position, text, timer_seconds FROM recipe_steps
  WHERE recipe_id = ? ORDER BY position`;
const TUTORIALS_SQL = `SELECT kind, url, title, publisher FROM recipe_tutorials
  WHERE recipe_id = ? ORDER BY CASE kind WHEN 'video' THEN 0 ELSE 1 END, url`;

/** Everything needed by the recipe screen and cook mode, or null for an unknown id. */
export async function getRecipeDetail(id: string): Promise<RecipeDetail | null> {
  const cached = detailCache.get(id);
  if (cached) return cached;
  const [summary, lines, steps, tutorials] = await Promise.all([
    getRecipeSummary(id),
    catalogPreparedQuery(INGREDIENT_LINES_SQL, [id], ingredientLineRowSchema),
    catalogPreparedQuery(STEPS_SQL, [id], stepRowSchema),
    catalogPreparedQuery(TUTORIALS_SQL, [id], tutorialRowSchema),
  ]);
  if (!summary) return null;
  const detail: RecipeDetail = {
    ...summary,
    ingredients: lines.map(toIngredientLine),
    steps: steps.map(toStep),
    tutorials: tutorials.map(toTutorial),
  };
  detailCache.set(id, detail);
  return detail;
}

const SEARCH_SQL = `SELECT ${RECIPE_SUMMARY_COLUMNS}
  FROM recipes_fts f JOIN recipes r ON r.id = f.recipe_id
  WHERE recipes_fts MATCH ? ${FILTER_SQL}
  ORDER BY bm25(recipes_fts, 0.0, 10.0, 3.0, 1.0), r.health_score DESC, r.id
  LIMIT ? OFFSET ?`;

const BROWSE_SQL = `SELECT ${RECIPE_SUMMARY_COLUMNS}
  FROM recipes r
  WHERE 1 = 1 ${FILTER_SQL}
  ORDER BY r.health_score DESC, r.id
  LIMIT ? OFFSET ?`;

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
 * Full-text search ranked by bm25 (title weighs most, then cuisine, then ingredients), with
 * synonyms and prefix matching. An empty query browses the filtered catalog by health score.
 * `cursor` is the offset returned as `nextCursor` by the previous page.
 */
export async function searchRecipes(
  query: string,
  filters: SearchFilters = {},
  cursor: number | null = 0,
): Promise<SearchPage> {
  const offset = Math.max(0, Math.trunc(cursor ?? 0));
  const match = buildFtsQuery(query);
  const params = filterParams(searchFilterValues(filters));
  let rows: z.infer<typeof recipeRowSchema>[];
  try {
    rows = match
      ? await catalogPreparedQuery(
          SEARCH_SQL,
          [match, ...params, SEARCH_PAGE_SIZE + 1, offset],
          recipeRowSchema,
        )
      : await catalogPreparedQuery(
          BROWSE_SQL,
          [...params, SEARCH_PAGE_SIZE + 1, offset],
          recipeRowSchema,
        );
  } catch (error) {
    // The builder only emits quoted word tokens, so this is a safety net: a search box must never
    // surface an error for what someone typed. Only a failed MATCH statement is swallowed; rows
    // that break the contract (`bad_rows`) are a real bug and still throw.
    if (!match || !isCatalogError(error) || error.kind !== 'query_failed') throw error;
    logger.warn('Full-text search failed; returning no results', { tokens: tokenize(query) });
    return { items: [], nextCursor: null };
  }
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

const INGREDIENTS_BY_IDS_SQL = `SELECT ${INGREDIENT_COLUMNS} FROM ingredients i
  WHERE i.id IN (SELECT value FROM json_each(?))`;

/** Ingredients for the given ids, in the order asked; unknown ids are skipped. */
export async function getIngredients(ids: readonly string[]): Promise<Ingredient[]> {
  const missing = [...new Set(ids.filter((id) => !ingredientCache.has(id)))];
  if (missing.length > 0) {
    const rows = await catalogPreparedQuery(
      INGREDIENTS_BY_IDS_SQL,
      [JSON.stringify(missing)],
      ingredientRowSchema,
    );
    for (const row of rows) ingredientCache.set(row.id, toIngredient(row));
  }
  const out: Ingredient[] = [];
  for (const id of ids) {
    const ingredient = ingredientCache.get(id);
    if (ingredient) out.push(ingredient);
  }
  return out;
}

const INGREDIENT_MATCH = `(i.name LIKE ? ESCAPE '\\' OR i.plural LIKE ? ESCAPE '\\'
    OR replace(i.id, '_', ' ') LIKE ? ESCAPE '\\')`;
const SEARCH_INGREDIENTS_SQL = `SELECT ${INGREDIENT_COLUMNS} FROM ingredients i
  WHERE ${INGREDIENT_MATCH} OR ${INGREDIENT_MATCH}
  LIMIT 200`;

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
  const first = `%${escapeLike(phrases[0] as string)}%`;
  const second = `%${escapeLike((phrases[1] ?? phrases[0]) as string)}%`;
  const rows = await catalogPreparedQuery(
    SEARCH_INGREDIENTS_SQL,
    [first, first, first, second, second, second],
    ingredientRowSchema,
  );
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

const SUBSTITUTIONS_SQL = `SELECT s.from_id, s.to_id, s.ratio, s.goal, s.note FROM substitutions s
  WHERE s.from_id IN (SELECT value FROM json_each(?))
    AND (? IS NULL OR s.goal IN (SELECT value FROM json_each(?)))
  ORDER BY s.from_id, s.goal, s.to_id`;

/** Swaps for the given ingredients, optionally limited to some goals. */
export async function getSubstitutions(
  ingredientIds: readonly string[],
  goals?: readonly SubstitutionGoal[],
): Promise<Substitution[]> {
  const ids = jsonList(ingredientIds);
  if (!ids) return [];
  const goalList = jsonList(goals);
  const rows = await catalogPreparedQuery(
    SUBSTITUTIONS_SQL,
    [ids, goalList, goalList],
    substitutionRowSchema,
  );
  return rows.map(toSubstitution);
}

const cuisineRowSchema = z.object({
  cuisine: z.string(),
  region: z.string(),
  recipe_count: z.number(),
});

const CUISINES_SQL = `SELECT cuisine, min(region) AS region, count(*) AS recipe_count
  FROM recipes GROUP BY cuisine ORDER BY recipe_count DESC, cuisine`;

/** Every cuisine with its region and recipe count, most common first. */
export function getCuisines(): Promise<CuisineInfo[]> {
  cuisinesPromise ??= catalogPreparedQuery(CUISINES_SQL, [], cuisineRowSchema)
    .then((rows) =>
      rows.map((row) => ({
        cuisine: row.cuisine,
        region: row.region,
        recipeCount: row.recipe_count,
      })),
    )
    .catch((error: unknown) => {
      cuisinesPromise = null;
      throw error;
    });
  return cuisinesPromise;
}

/** Build information from the catalog's `meta` table. */
export function getCatalogMeta(): Promise<CatalogMeta> {
  metaPromise ??= catalogPreparedQuery('SELECT key, value FROM meta', [], metaRowSchema)
    .then(toCatalogMeta)
    .catch((error: unknown) => {
      metaPromise = null;
      throw error;
    });
  return metaPromise;
}
