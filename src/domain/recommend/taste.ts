/**
 * Learns what a person enjoys from their feedback. Each event adds a decayed signal to the cuisine,
 * core ingredients and goal tags of the recipe it was about; "not for me" reasons add targeted
 * penalties. The result is a small preference vector that scores any candidate in [0, 1], with 0.5
 * meaning "no opinion".
 */
import { type RankingConfig } from './config';
import { type FeedbackEvent } from '../types/feedback';
import { GOAL_TAGS, type GoalTag } from '../types/goals';
import { type RecipeId, type RecipeSummary } from '../types/recipe';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** The recipe fields taste learning reads. */
export type TasteFeatures = Pick<
  RecipeSummary,
  'id' | 'cuisine' | 'coreIngredientIds' | 'goalTags'
>;

export type TasteLookup = ReadonlyMap<RecipeId, TasteFeatures>;

export interface TasteProfile {
  readonly cuisines: ReadonlyMap<string, number>;
  readonly ingredients: ReadonlyMap<string, number>;
  /** Affinity per goal tag, indexed like `GOAL_TAGS`. */
  readonly goalTags: Float64Array;
  /** Accumulated, decayed "takes too long" signal (≥ 0). */
  readonly shorter: number;
  /** Accumulated, decayed "too heavy" signal (≥ 0). */
  readonly lighter: number;
  /** True when no event carried any weight; scoring then short-circuits to neutral. */
  readonly empty: boolean;
}

const GOAL_INDEX: ReadonlyMap<GoalTag, number> = new Map(GOAL_TAGS.map((tag, i) => [tag, i]));
const LOWER_CALORIE = GOAL_TAGS.indexOf('lower_calorie');

/** Weight of a signal `ageMs` old: 1 now, 0.5 after one half-life. Future events count as now. */
export function decayWeight(ageMs: number, halfLifeDays: number): number {
  if (!(ageMs > 0)) return 1;
  return Math.pow(0.5, ageMs / (halfLifeDays * DAY_MS));
}

function add(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value);
}

function clampMap(map: Map<string, number>, limit: number) {
  for (const [key, value] of map) map.set(key, Math.max(-limit, Math.min(limit, value)));
}

export function buildTasteProfile(
  feedback: readonly FeedbackEvent[],
  lookup: TasteLookup,
  now: number,
  config: RankingConfig,
): TasteProfile {
  const t = config.taste;
  const cuisines = new Map<string, number>();
  const ingredients = new Map<string, number>();
  const goalTags = new Float64Array(GOAL_TAGS.length);
  let shorter = 0;
  let lighter = 0;
  let empty = true;

  for (const event of feedback) {
    const decay = decayWeight(now - event.at, t.halfLifeDays);
    if (!(decay > 0)) continue;
    const signal = t.signal[event.kind] * decay;
    const recipe = lookup.get(event.recipeId);
    empty = false;

    if (recipe) {
      add(cuisines, recipe.cuisine, signal);
      for (const id of recipe.coreIngredientIds) add(ingredients, id, signal * t.ingredientShare);
      for (const tag of recipe.goalTags) {
        const index = GOAL_INDEX.get(tag);
        if (index !== undefined) goalTags[index]! += signal * t.goalTagShare;
      }
    }

    if (event.kind !== 'not_for_me') continue;
    for (const reason of event.reasons) {
      switch (reason) {
        case 'not_my_cuisine':
          if (recipe) add(cuisines, recipe.cuisine, -t.reasonPenalty.not_my_cuisine * decay);
          break;
        case 'dislike_ingredient':
          if (event.ingredientId !== undefined) {
            add(ingredients, event.ingredientId, -t.reasonPenalty.dislike_ingredient * decay);
          } else if (recipe) {
            const penalty = t.reasonPenalty.dislike_unnamed_ingredient * decay;
            for (const id of recipe.coreIngredientIds) add(ingredients, id, -penalty);
          }
          break;
        case 'too_long':
          shorter += t.reasonPenalty.too_long * decay;
          break;
        case 'too_heavy':
          lighter += t.reasonPenalty.too_heavy * decay;
          goalTags[LOWER_CALORIE]! += t.reasonPenalty.too_heavy * decay * t.goalTagShare;
          break;
      }
    }
  }

  clampMap(cuisines, t.clamp);
  clampMap(ingredients, t.clamp);
  for (let i = 0; i < goalTags.length; i++) {
    goalTags[i] = Math.max(-t.clamp, Math.min(t.clamp, goalTags[i]!));
  }
  return {
    cuisines,
    ingredients,
    goalTags,
    shorter: Math.min(shorter, t.clamp),
    lighter: Math.min(lighter, t.clamp),
    empty,
  };
}

export const EMPTY_TASTE: TasteProfile = {
  cuisines: new Map(),
  ingredients: new Map(),
  goalTags: new Float64Array(GOAL_TAGS.length),
  shorter: 0,
  lighter: 0,
  empty: true,
};

/** Lowest ingredient affinity among the recipe's core ingredients (0 when none are known). */
export function worstIngredientAffinity(
  recipe: Pick<RecipeSummary, 'coreIngredientIds'>,
  profile: TasteProfile,
): number {
  let worst = 0;
  for (const id of recipe.coreIngredientIds) {
    const value = profile.ingredients.get(id);
    if (value !== undefined && value < worst) worst = value;
  }
  return worst;
}

/** Taste fit in [0, 1]; 0.5 when the profile has no opinion about this recipe. */
export function tasteValue(
  recipe: Pick<RecipeSummary, 'cuisine' | 'coreIngredientIds' | 'goalTags' | 'nutrition'>,
  profile: TasteProfile,
  config: RankingConfig,
): number {
  if (profile.empty) return 0.5;
  const t = config.taste;

  const cuisine = profile.cuisines.get(recipe.cuisine) ?? 0;

  let ingredientSum = 0;
  let worst = 0;
  const ids = recipe.coreIngredientIds;
  for (const id of ids) {
    const value = profile.ingredients.get(id);
    if (value === undefined) continue;
    ingredientSum += value;
    if (value < worst) worst = value;
  }
  const ingredientMean = ids.length > 0 ? ingredientSum / ids.length : 0;
  const ingredient = ingredientMean + t.worstIngredientShare * worst;

  let goalSum = 0;
  let goalCount = 0;
  for (const tag of recipe.goalTags) {
    const index = GOAL_INDEX.get(tag);
    if (index === undefined) continue;
    goalSum += profile.goalTags[index]!;
    goalCount++;
  }
  const goal = goalCount > 0 ? goalSum / goalCount : 0;

  let heavy = 0;
  const kcal = recipe.nutrition.kcal;
  if (profile.lighter > 0 && kcal !== null && kcal > t.heavyKcalFrom) {
    heavy = profile.lighter * Math.min(1, (kcal - t.heavyKcalFrom) / t.heavyKcalSpan);
  }

  const raw =
    t.mix.cuisine * cuisine + t.mix.ingredients * ingredient + t.mix.goalTags * goal - heavy;
  return 0.5 + 0.5 * Math.tanh(raw / t.softness);
}
