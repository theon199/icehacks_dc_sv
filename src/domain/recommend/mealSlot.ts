/**
 * Meals for now: which meal a moment belongs to, which catalog courses make up each meal, and how
 * the pantry ranking leans for it.
 *
 * Ranking starts from the engine (`rankRecipes`, which drops anything unsafe for the person's
 * allergens and diets, fail-closed, and scores overall fit), keeps recipes the pantry mostly
 * covers, and orders them by pantry coverage plus a small per-meal lean: lunch favours dishes
 * ready within the quick limit and lighter in calories; breakfast and dinner take the coverage
 * order as it is. The lean is smaller than one missing ingredient on a typical recipe, so it
 * reorders close calls without pushing a dish the fridge covers below one it does not.
 */
import { DEFAULT_RANKING_CONFIG, type RankingConfig } from './config';
import { rankRecipes } from './rank';
import { type IngredientId } from '../types/ingredient';
import { type UserPreferences } from '../types/preferences';
import { type Course, type RecipeId, type RecipeSummary } from '../types/recipe';

export const MEAL_TIMES = ['breakfast', 'lunch', 'dinner'] as const;

export type MealTime = (typeof MEAL_TIMES)[number];

/** First hour (local, 24 h) of each meal; dinner runs on past midnight until breakfast starts. */
export const MEAL_TIME_START_HOURS: Readonly<Record<MealTime, number>> = {
  breakfast: 4,
  lunch: 11,
  dinner: 16,
};

/**
 * The meal a moment falls in, by its local hour: breakfast 04:00–10:59, lunch 11:00–15:59, dinner
 * otherwise (including the small hours). An invalid date reads as dinner, the meal with no limits.
 */
export function mealForTime(date: Date): MealTime {
  const hour = date.getHours();
  if (hour >= MEAL_TIME_START_HOURS.breakfast && hour < MEAL_TIME_START_HOURS.lunch) {
    return 'breakfast';
  }
  if (hour >= MEAL_TIME_START_HOURS.lunch && hour < MEAL_TIME_START_HOURS.dinner) return 'lunch';
  return 'dinner';
}

/** Catalog courses that make each meal. Sides, snacks, desserts and drinks are not a meal alone. */
export const MEAL_TIME_COURSES: Readonly<Record<MealTime, readonly Course[]>> = {
  breakfast: ['breakfast'],
  lunch: ['main', 'soup', 'salad'],
  dinner: ['main', 'soup'],
};

/** Every course any meal uses, for narrowing a catalog read before ranking. */
export const MEAL_COURSES: readonly Course[] = [
  ...new Set(Object.values(MEAL_TIME_COURSES).flat()),
];

export function fitsMealTime(recipe: Pick<RecipeSummary, 'course'>, meal: MealTime): boolean {
  return MEAL_TIME_COURSES[meal].includes(recipe.course);
}

/** How one meal leans the pantry order; zero bonuses mean the meal takes coverage order as is. */
export interface MealTimeLean {
  /** Added when the total time is known and within the ranking config's quick limit. */
  readonly quickBonus: number;
  /** Up to this much for lighter dishes, scaled between `heavyKcal` (none) and `lightKcal` (all). */
  readonly lightBonus: number;
  readonly lightKcal: number;
  readonly heavyKcal: number;
}

const NO_LEAN: MealTimeLean = { quickBonus: 0, lightBonus: 0, lightKcal: 0, heavyKcal: 0 };

export const MEAL_TIME_LEANS: Readonly<Record<MealTime, MealTimeLean>> = {
  breakfast: NO_LEAN,
  lunch: { quickBonus: 0.1, lightBonus: 0.05, lightKcal: 400, heavyKcal: 750 },
  dinner: NO_LEAN,
};

/** The meal's lean for one recipe: 0 when nothing applies, never negative. Unknown values add 0. */
export function mealTimeAdjustment(
  recipe: Pick<RecipeSummary, 'totalMinutes' | 'nutrition'>,
  meal: MealTime,
  config: RankingConfig = DEFAULT_RANKING_CONFIG,
): number {
  const lean = MEAL_TIME_LEANS[meal];
  let delta = 0;
  if (
    lean.quickBonus > 0 &&
    recipe.totalMinutes !== null &&
    recipe.totalMinutes <= config.feed.quickMaxMinutes
  ) {
    delta += lean.quickBonus;
  }
  const kcal = recipe.nutrition.kcal;
  if (lean.lightBonus > 0 && kcal !== null && lean.heavyKcal > lean.lightKcal) {
    const share = (lean.heavyKcal - kcal) / (lean.heavyKcal - lean.lightKcal);
    delta += lean.lightBonus * Math.min(1, Math.max(0, share));
  }
  return delta;
}

export interface MealTimePick {
  readonly recipe: RecipeSummary;
  /** Core ingredients on hand, in the recipe's order. */
  readonly ownedIds: readonly IngredientId[];
  /** Core ingredients still needed, in the recipe's order. */
  readonly missingIds: readonly IngredientId[];
  /** Share of core ingredients on hand, 0..1. */
  readonly coverage: number;
  /** 0–100 overall fit from the engine. */
  readonly fitScore: number;
  /** Coverage plus the meal's lean; the order key. */
  readonly score: number;
}

export interface MealTimeInput {
  readonly prefs: UserPreferences;
  /** Epoch milliseconds; the engine's recency is measured from here. */
  readonly now: number;
  /** Catalog ingredient ids on hand. */
  readonly pantry: ReadonlySet<IngredientId>;
  /** Most picks per meal (default 24). */
  readonly limit?: number;
  /** Least share of core ingredients on hand (default: the config's pantry-mode minimum). */
  readonly minCoverage?: number;
  readonly config?: RankingConfig;
}

export type MealTimePicks = Readonly<Record<MealTime, readonly MealTimePick[]>>;

export const DEFAULT_MEAL_TIME_LIMIT = 24;

function byScore(a: MealTimePick, b: MealTimePick): number {
  return (
    b.score - a.score ||
    b.fitScore - a.fitScore ||
    (a.recipe.id < b.recipe.id ? -1 : a.recipe.id > b.recipe.id ? 1 : 0)
  );
}

/**
 * The best safe picks for every meal at once, from one engine pass. Each meal keeps one version
 * per dish family (the best placed), and only recipes whose core ingredients the pantry covers to
 * at least `minCoverage`; a recipe with no core ingredients is never "from your fridge".
 */
export function rankMealTimes(
  candidates: readonly RecipeSummary[],
  input: MealTimeInput,
): MealTimePicks {
  const empty: MealTimePicks = { breakfast: [], lunch: [], dinner: [] };
  if (input.pantry.size === 0 || candidates.length === 0) return empty;
  const config = input.config ?? DEFAULT_RANKING_CONFIG;
  const minCoverage = input.minCoverage ?? config.feed.pantryMinCoverage;
  const limit = Math.max(0, Math.floor(input.limit ?? DEFAULT_MEAL_TIME_LIMIT));

  const usable = candidates.filter(
    (recipe) =>
      recipe.coreIngredientIds.length > 0 && MEAL_TIMES.some((meal) => fitsMealTime(recipe, meal)),
  );
  const ranked = rankRecipes(usable, {
    prefs: input.prefs,
    now: input.now,
    pantry: input.pantry,
    config,
  });

  const covered: Omit<MealTimePick, 'score'>[] = [];
  const seen = new Set<RecipeId>();
  for (const entry of ranked) {
    const { recipe } = entry;
    if (seen.has(recipe.id)) continue;
    seen.add(recipe.id);
    const ownedIds: IngredientId[] = [];
    const missingIds: IngredientId[] = [];
    for (const id of recipe.coreIngredientIds)
      (input.pantry.has(id) ? ownedIds : missingIds).push(id);
    const coverage = ownedIds.length / recipe.coreIngredientIds.length;
    if (coverage < minCoverage) continue;
    covered.push({ recipe, ownedIds, missingIds, coverage, fitScore: entry.fitScore });
  }

  const out: Record<MealTime, MealTimePick[]> = { breakfast: [], lunch: [], dinner: [] };
  for (const meal of MEAL_TIMES) {
    const picks = covered
      .filter((pick) => fitsMealTime(pick.recipe, meal))
      .map((pick) => ({
        ...pick,
        score: pick.coverage + mealTimeAdjustment(pick.recipe, meal, config),
      }))
      .sort(byScore);
    const families = new Set<string>();
    for (const pick of picks) {
      if (out[meal].length >= limit) break;
      if (families.has(pick.recipe.familyId)) continue;
      families.add(pick.recipe.familyId);
      out[meal].push(pick);
    }
  }
  return out;
}
