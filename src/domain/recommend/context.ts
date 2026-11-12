/**
 * Everything ranking needs, compiled once per request from preferences, feedback, pantry and
 * impressions into sets, maps and typed arrays so per-candidate work is a handful of lookups.
 */
import { DEFAULT_RANKING_CONFIG, weightVector, type RankingConfig } from './config';
import { buildTasteProfile, DAY_MS, type TasteLookup, type TasteProfile } from './taste';
import { compileSafetyRules, type SafetyRules } from '../safety/checkRecipe';
import { cuisineRegion, type CuisineId, type RegionId } from '../types/cuisines';
import { type FeedbackEvent, type Impression } from '../types/feedback';
import { GOAL_TAGS_FOR, goalTagMask, type Goal } from '../types/goals';
import { type IngredientId } from '../types/ingredient';
import { type PantryItem } from '../types/pantry';
import { type UserPreferences } from '../types/preferences';
import { type Effort, type RecipeId, type RecipeSummary } from '../types/recipe';

export type PantryInput = Iterable<IngredientId | Pick<PantryItem, 'ingredientId'>>;

export interface RankInput {
  readonly prefs: UserPreferences;
  /** Epoch milliseconds; all recency and decay is measured from here. */
  readonly now: number;
  readonly feedback?: readonly FeedbackEvent[];
  readonly pantry?: PantryInput;
  /** Cards shown recently, used to avoid repeating them. */
  readonly shown?: readonly Impression[];
  /**
   * Recipes referenced by feedback or impressions that are not among the candidates (for example
   * dishes filtered out by the current mode). Candidates are always consulted first.
   */
  readonly history?: TasteLookup;
  readonly config?: RankingConfig;
}

export interface RankContext {
  readonly config: RankingConfig;
  readonly weights: Float64Array;
  readonly now: number;
  readonly prefs: UserPreferences;
  readonly safety: SafetyRules;
  readonly loved: ReadonlySet<CuisineId>;
  /** Region → the first loved cuisine in it (in the person's order). */
  readonly lovedRegions: ReadonlyMap<RegionId, CuisineId>;
  readonly goals: readonly Goal[];
  /** Tag mask per goal, aligned with `goals`. */
  readonly goalMasks: Int32Array;
  /** The stated time budget after "too long" feedback; null means time does not matter. */
  readonly timeBudget: number | null;
  readonly effortLimit: Effort;
  readonly pantry: ReadonlySet<IngredientId>;
  readonly taste: TasteProfile;
  readonly lastShown: ReadonlyMap<RecipeId, number>;
  readonly lastCooked: ReadonlyMap<RecipeId, number>;
  /** Cuisines the person has already seen or given feedback on. */
  readonly seenCuisines: ReadonlySet<CuisineId>;
}

function toPantrySet(pantry: PantryInput | undefined): Set<IngredientId> {
  const out = new Set<IngredientId>();
  if (!pantry) return out;
  for (const entry of pantry) out.add(typeof entry === 'string' ? entry : entry.ingredientId);
  return out;
}

function noteLatest(map: Map<RecipeId, number>, id: RecipeId, at: number) {
  const previous = map.get(id);
  if (previous === undefined || at > previous) map.set(id, at);
}

/** Effective budget: "too long" feedback shrinks it, and creates one when none was stated. */
export function effectiveTimeBudget(
  stated: number | null,
  shorter: number,
  config: RankingConfig,
): number | null {
  if (shorter <= 0) return stated;
  const shrink = config.time.maxShrink * (1 - Math.exp(-shorter));
  return (stated ?? config.time.impliedBudgetMinutes) * (1 - shrink);
}

export function createRankContext(
  input: RankInput,
  candidates: readonly RecipeSummary[] = [],
): RankContext {
  const config = input.config ?? DEFAULT_RANKING_CONFIG;
  const { prefs, now } = input;

  const lookup = new Map<
    RecipeId,
    Pick<RecipeSummary, 'id' | 'cuisine' | 'coreIngredientIds' | 'goalTags'>
  >(input.history);
  for (const recipe of candidates) lookup.set(recipe.id, recipe);

  const feedback = input.feedback ?? [];
  const taste = buildTasteProfile(feedback, lookup, now, config);

  const loved = new Set(prefs.cuisines);
  const lovedRegions = new Map<RegionId, CuisineId>();
  for (const cuisine of prefs.cuisines) {
    const region = cuisineRegion(cuisine);
    if (region && !lovedRegions.has(region)) lovedRegions.set(region, cuisine);
  }

  const goals = [...new Set(prefs.goals)];
  const goalMasks = Int32Array.from(goals, (goal) => goalTagMask(GOAL_TAGS_FOR[goal]));

  const lastShown = new Map<RecipeId, number>();
  const seenCuisines = new Set<CuisineId>();
  for (const impression of input.shown ?? []) {
    noteLatest(lastShown, impression.recipeId, impression.at);
    const cuisine = lookup.get(impression.recipeId)?.cuisine;
    if (cuisine) seenCuisines.add(cuisine);
  }
  const lastCooked = new Map<RecipeId, number>();
  for (const event of feedback) {
    if (event.kind === 'cooked') noteLatest(lastCooked, event.recipeId, event.at);
    const cuisine = lookup.get(event.recipeId)?.cuisine;
    if (cuisine) seenCuisines.add(cuisine);
  }

  return {
    config,
    weights: weightVector(config),
    now,
    prefs,
    safety: compileSafetyRules(prefs),
    loved,
    lovedRegions,
    goals,
    goalMasks,
    timeBudget: effectiveTimeBudget(prefs.timeBudgetMinutes, taste.shorter, config),
    effortLimit: prefs.effort,
    pantry: toPantrySet(input.pantry),
    taste,
    lastShown,
    lastCooked,
    seenCuisines,
  };
}

/** Days since `at`, or Infinity when it never happened. */
export function daysSince(ctx: Pick<RankContext, 'now'>, at: number | undefined): number {
  return at === undefined ? Number.POSITIVE_INFINITY : (ctx.now - at) / DAY_MS;
}
