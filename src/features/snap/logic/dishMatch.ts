/**
 * From a dish recognised in a photo to catalog recipes: which recipes are closest to it, and which
 * close recipe makes the best healthier version for this person.
 *
 * Search runs several small full-text queries (the dish name, its distinctive words, its key
 * ingredients) because one query with every word would rarely match anything. Each recipe found is
 * scored by how close it is to the dish; recipes unsafe for the person are dropped (fail-closed).
 */
import { compileSafetyRules, isRecipeSafe, type SafetyPrefs } from '@/domain/safety';
import { GOAL_DETAILS, recipeGoalMask, type Goal } from '@/domain/types/goals';
import type { RecipeSummary } from '@/domain/types/recipe';
import type { SnapDish } from '@/lib/api/ai';

import { foodWords, nameKey, wordOverlap } from './words';

export type DishQueryKind = 'name' | 'nameWord' | 'ingredient';

export interface DishQuery {
  kind: DishQueryKind;
  text: string;
}

/** Words common in dish names that do not identify the dish on their own. */
const GENERIC_DISH_WORDS = new Set([
  'bowl',
  'plate',
  'dish',
  'meal',
  'serving',
  'side',
  'mixed',
  'house',
  'special',
  'classic',
  'traditional',
]);

const MAX_NAME_WORDS = 3;
const MAX_INGREDIENTS = 4;

export type DishInput = Pick<SnapDish, 'name' | 'cuisine' | 'key_ingredients'>;

/** The searches to run for a dish, most specific first, without duplicates. */
export function dishSearchQueries(dish: DishInput): DishQuery[] {
  const queries: DishQuery[] = [];
  const seen = new Set<string>();
  const push = (kind: DishQueryKind, text: string) => {
    const key = nameKey(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    queries.push({ kind, text: text.trim() });
  };
  push('name', dish.name);
  const words = foodWords(dish.name).filter(
    (word) => word.length >= 4 && !GENERIC_DISH_WORDS.has(word),
  );
  if (words.length > 1) for (const word of words.slice(0, MAX_NAME_WORDS)) push('nameWord', word);
  for (const ingredient of dish.key_ingredients.slice(0, MAX_INGREDIENTS)) {
    push('ingredient', ingredient);
  }
  return queries;
}

export interface DishSearchResult<R> {
  query: DishQuery;
  recipes: readonly R[];
}

export interface DishHit<R> {
  recipe: R;
  nameHit: boolean;
  ingredientHits: number;
}

/** Folds the separate searches into one entry per recipe, remembering which searches found it. */
export function mergeDishHits<R extends { id: string }>(
  results: readonly DishSearchResult<R>[],
): DishHit<R>[] {
  const hits = new Map<string, { recipe: R; nameHit: boolean; ingredients: Set<string> }>();
  for (const { query, recipes } of results) {
    for (const recipe of recipes) {
      let hit = hits.get(recipe.id);
      if (!hit) {
        hit = { recipe, nameHit: false, ingredients: new Set() };
        hits.set(recipe.id, hit);
      }
      if (query.kind === 'name') hit.nameHit = true;
      if (query.kind === 'ingredient') hit.ingredients.add(nameKey(query.text));
    }
  }
  return [...hits.values()].map(({ recipe, nameHit, ingredients }) => ({
    recipe,
    nameHit,
    ingredientHits: ingredients.size,
  }));
}

function sameCuisine(dishCuisine: string | null, recipeCuisine: string): boolean {
  if (!dishCuisine) return false;
  const key = nameKey(dishCuisine);
  return key.length > 0 && key === nameKey(recipeCuisine.replace(/_/g, ' '));
}

/** How close a found recipe is to the dish, 0..1. */
export function dishCloseness(
  hit: DishHit<Pick<RecipeSummary, 'title' | 'cuisine'>>,
  dish: DishInput,
): number {
  const ingredientCount = Math.min(MAX_INGREDIENTS, dish.key_ingredients.length);
  const ingredientShare = ingredientCount > 0 ? hit.ingredientHits / ingredientCount : 0;
  const score =
    0.55 * wordOverlap(dish.name, hit.recipe.title) +
    0.15 * (hit.nameHit ? 1 : 0) +
    0.2 * Math.min(1, ingredientShare) +
    0.1 * (sameCuisine(dish.cuisine, hit.recipe.cuisine) ? 1 : 0);
  return Math.round(score * 1000) / 1000;
}

export interface CloseRecipe {
  recipe: RecipeSummary;
  closeness: number;
}

export const DEFAULT_CLOSE_LIMIT = 6;
export const MIN_CLOSENESS = 0.15;

/** Safe recipes closest to the dish, best first. */
export function rankCloseRecipes(
  hits: readonly DishHit<RecipeSummary>[],
  dish: DishInput,
  prefs: SafetyPrefs,
  limit = DEFAULT_CLOSE_LIMIT,
): CloseRecipe[] {
  const rules = compileSafetyRules(prefs);
  return hits
    .filter((hit) => isRecipeSafe(hit.recipe, rules))
    .map((hit) => ({ recipe: hit.recipe, closeness: dishCloseness(hit, dish) }))
    .filter((entry) => entry.closeness >= MIN_CLOSENESS)
    .sort(
      (a, b) =>
        b.closeness - a.closeness ||
        b.recipe.healthScore - a.recipe.healthScore ||
        (a.recipe.id < b.recipe.id ? -1 : 1),
    )
    .slice(0, Math.max(0, limit));
}

// --- Healthier version ---------------------------------------------------------------------------

export type Improvement =
  | { nutrient: 'kcal'; direction: 'less'; amount: number }
  | { nutrient: 'fat_g'; direction: 'less'; amount: number }
  | { nutrient: 'sodium_mg'; direction: 'less'; amount: number }
  | { nutrient: 'fiber_g'; direction: 'more'; amount: number }
  | { nutrient: 'protein_g'; direction: 'more'; amount: number };

/**
 * Where a recipe serving clearly beats the estimated plate. Margins are generous because the
 * estimate is rough: a few calories either way is not "healthier".
 */
export function improvementsOver(
  recipe: Pick<RecipeSummary, 'nutrition'>,
  estimate: SnapDish['nutrition'],
): Improvement[] {
  const n = recipe.nutrition;
  const out: Improvement[] = [];
  const kcal = estimate.kcal.estimate;
  if (n.kcal != null && kcal > 0 && n.kcal <= kcal * 0.85) {
    out.push({ nutrient: 'kcal', direction: 'less', amount: Math.round(kcal - n.kcal) });
  }
  const sodium = estimate.sodium_mg.estimate;
  if (n.sodiumMg != null && sodium > 0 && n.sodiumMg <= sodium * 0.8) {
    out.push({ nutrient: 'sodium_mg', direction: 'less', amount: Math.round(sodium - n.sodiumMg) });
  }
  const fat = estimate.fat_g.estimate;
  if (n.fatG != null && fat > 0 && n.fatG <= fat * 0.8) {
    out.push({ nutrient: 'fat_g', direction: 'less', amount: Math.round(fat - n.fatG) });
  }
  const fiber = estimate.fiber_g.estimate;
  if (n.fiberG != null && n.fiberG >= Math.max(fiber * 1.25, fiber + 2)) {
    out.push({ nutrient: 'fiber_g', direction: 'more', amount: Math.round(n.fiberG - fiber) });
  }
  const protein = estimate.protein_g.estimate;
  if (n.proteinG != null && n.proteinG >= Math.max(protein * 1.15, protein + 5)) {
    out.push({
      nutrient: 'protein_g',
      direction: 'more',
      amount: Math.round(n.proteinG - protein),
    });
  }
  return out;
}

/** Share of the person's goals a recipe serves; the health score when no goals are set. */
export function goalFit(
  recipe: Pick<RecipeSummary, 'goalTags' | 'healthScore'>,
  goals: readonly Goal[],
): number {
  if (goals.length === 0) return Math.min(1, Math.max(0, recipe.healthScore));
  const mask = recipeGoalMask(recipe.goalTags);
  let served = 0;
  for (const goal of goals) if (mask & GOAL_DETAILS[goal].mask) served++;
  return served / goals.length;
}

export interface HealthierVersion {
  recipe: RecipeSummary;
  closeness: number;
  improvements: Improvement[];
  /** The person's goals this recipe serves. */
  goalsServed: Goal[];
}

/** Recipes this far from the dish are not offered as "a version of" it. */
export const MIN_HEALTHIER_CLOSENESS = 0.25;

/**
 * The close recipe that best serves the person's goals while clearly improving on the estimate.
 * `closest` must already be safety-screened (as `rankCloseRecipes` returns it). Null when no close
 * recipe is meaningfully healthier.
 */
export function pickHealthierVersion(
  closest: readonly CloseRecipe[],
  estimate: SnapDish['nutrition'],
  goals: readonly Goal[],
): HealthierVersion | null {
  let best: { score: number; version: HealthierVersion } | null = null;
  for (const { recipe, closeness } of closest) {
    if (closeness < MIN_HEALTHIER_CLOSENESS || recipe.nutritionConfidence === 'none') continue;
    const improvements = improvementsOver(recipe, estimate);
    if (improvements.length === 0) continue;
    const score =
      0.45 * closeness +
      0.35 * goalFit(recipe, goals) +
      0.2 * Math.min(1, Math.max(0, recipe.healthScore));
    if (!best || score > best.score) {
      const mask = recipeGoalMask(recipe.goalTags);
      best = {
        score,
        version: {
          recipe,
          closeness,
          improvements,
          goalsServed: goals.filter((goal) => (mask & GOAL_DETAILS[goal].mask) !== 0),
        },
      };
    }
  }
  return best?.version ?? null;
}
