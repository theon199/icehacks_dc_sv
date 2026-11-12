/**
 * Per-candidate scoring: the seven features, the weighted base score and the freshness
 * adjustments. Written for the ranking hot loop: no allocation per candidate, features go straight
 * into a packed `Float64Array`.
 */
import { F, FEATURE_COUNT, type FeatureName } from './config';
import { type RankContext } from './context';
import { decayWeight, DAY_MS, tasteValue, worstIngredientAffinity } from './taste';
import { goalTagMask } from '../types/goals';
import { type RecipeSummary } from '../types/recipe';

export type FeatureVector = Readonly<Record<FeatureName, number>>;

export function cuisineMatch(recipe: Pick<RecipeSummary, 'cuisine' | 'region'>, ctx: RankContext) {
  const c = ctx.config.cuisine;
  if (ctx.loved.size === 0) return c.noPreference;
  if (ctx.loved.has(recipe.cuisine)) return c.loved;
  if (ctx.lovedRegions.has(recipe.region)) return c.sameRegion;
  return c.other;
}

/** Number of the person's goals the recipe serves. */
export function goalsServed(recipeTagMask: number, ctx: RankContext): number {
  let served = 0;
  for (let i = 0; i < ctx.goalMasks.length; i++) if (recipeTagMask & ctx.goalMasks[i]!) served++;
  return served;
}

export function goalMatch(
  recipe: Pick<RecipeSummary, 'goalTags' | 'healthScore'>,
  ctx: RankContext,
) {
  const health = clamp01(recipe.healthScore);
  if (ctx.goals.length === 0) return health;
  const coverage = goalsServed(goalTagMask(recipe.goalTags), ctx) / ctx.goals.length;
  const share = ctx.config.goal.coverageShare;
  return share * coverage + (1 - share) * health;
}

export function timeFit(recipe: Pick<RecipeSummary, 'totalMinutes'>, ctx: RankContext) {
  const budget = ctx.timeBudget;
  if (budget === null) return 1;
  const minutes = recipe.totalMinutes;
  if (minutes === null) return ctx.config.time.unknown;
  if (minutes <= budget) return 1;
  const span = (ctx.config.time.zeroAtMultiple - 1) * budget;
  return span > 0 ? Math.max(0, 1 - (minutes - budget) / span) : 0;
}

export function effortFit(recipe: Pick<RecipeSummary, 'effort'>, ctx: RankContext) {
  const over = recipe.effort - ctx.effortLimit;
  if (over <= 0) return 1;
  return over === 1 ? ctx.config.effort.onePastLimit : ctx.config.effort.twoPastLimit;
}

/** Core ingredients the person has on hand. */
export function pantryOwned(recipe: Pick<RecipeSummary, 'coreIngredientIds'>, ctx: RankContext) {
  if (ctx.pantry.size === 0) return 0;
  let owned = 0;
  const ids = recipe.coreIngredientIds;
  for (let i = 0; i < ids.length; i++) if (ctx.pantry.has(ids[i]!)) owned++;
  return owned;
}

/**
 * Share of core (non-staple) ingredients on hand. A recipe with no core ingredients scores 0: it
 * says nothing about what the person has, so it should not win "use my pantry".
 */
export function pantryCoverage(recipe: Pick<RecipeSummary, 'coreIngredientIds'>, ctx: RankContext) {
  const total = recipe.coreIngredientIds.length;
  return total === 0 ? 0 : pantryOwned(recipe, ctx) / total;
}

export function dataQuality(recipe: Pick<RecipeSummary, 'nutritionConfidence'>, ctx: RankContext) {
  return ctx.config.dataQuality[recipe.nutritionConfidence] ?? ctx.config.dataQuality.none;
}

function clamp01(value: number) {
  return value > 1 ? 1 : value > 0 ? value : 0;
}

/** Writes the recipe's features at `out[offset … offset + FEATURE_COUNT)` and returns the base. */
export function writeFeatures(
  recipe: RecipeSummary,
  ctx: RankContext,
  out: Float64Array,
  offset: number,
): number {
  out[offset + F.cuisineMatch] = cuisineMatch(recipe, ctx);
  out[offset + F.goalMatch] = goalMatch(recipe, ctx);
  out[offset + F.timeFit] = timeFit(recipe, ctx);
  out[offset + F.effortFit] = effortFit(recipe, ctx);
  out[offset + F.pantryCoverage] = pantryCoverage(recipe, ctx);
  out[offset + F.tasteHistory] = tasteValue(recipe, ctx.taste, ctx.config);
  out[offset + F.dataQuality] = dataQuality(recipe, ctx);

  let base = 0;
  for (let i = 0; i < FEATURE_COUNT; i++) base += ctx.weights[i]! * out[offset + i]!;
  return clamp01(base);
}

/** Repetition penalties, the disliked-ingredient penalty and boosts, as one signed number. */
export function scoreAdjustment(recipe: RecipeSummary, ctx: RankContext): number {
  const p = ctx.config.penalties;
  const b = ctx.config.boosts;
  const windowMs = p.windowDays * DAY_MS;
  let delta = 0;

  const shownAt = ctx.lastShown.get(recipe.id);
  if (shownAt !== undefined && ctx.now - shownAt < windowMs) {
    delta -= p.recentlyShown * decayWeight(ctx.now - shownAt, p.shownHalfLifeDays);
  }
  const cookedAt = ctx.lastCooked.get(recipe.id);
  if (cookedAt !== undefined && ctx.now - cookedAt < windowMs) {
    delta -= p.recentlyCooked * decayWeight(ctx.now - cookedAt, p.cookedHalfLifeDays);
  }
  if (!ctx.taste.empty && worstIngredientAffinity(recipe, ctx.taste) <= p.dislikedAffinity) {
    delta -= p.dislikedIngredient;
  }
  if (isNovel(recipe, ctx)) delta += b.novelty;
  if (ctx.prefs.smallAppetite && recipe.gentle) delta += b.gentle;
  return delta;
}

/** A cuisine the person has not met yet, from a region where they love another cuisine. */
export function isNovel(recipe: Pick<RecipeSummary, 'cuisine' | 'region'>, ctx: RankContext) {
  return (
    !ctx.loved.has(recipe.cuisine) &&
    ctx.lovedRegions.has(recipe.region) &&
    !ctx.seenCuisines.has(recipe.cuisine)
  );
}

export function finalScore(base: number, adjustment: number): number {
  return clamp01(base + adjustment);
}

export function toFitScore(base: number): number {
  return Math.round(clamp01(base) * 100);
}

/** Reads a packed feature row back into a named object (for explanations and debugging). */
export function readFeatures(packed: Float64Array, offset = 0): FeatureVector {
  const at = (index: number) => packed[offset + index] ?? 0;
  return {
    cuisineMatch: at(F.cuisineMatch),
    goalMatch: at(F.goalMatch),
    timeFit: at(F.timeFit),
    effortFit: at(F.effortFit),
    pantryCoverage: at(F.pantryCoverage),
    tasteHistory: at(F.tasteHistory),
    dataQuality: at(F.dataQuality),
  };
}

export interface RecipeScore {
  readonly base: number;
  readonly score: number;
  readonly fitScore: number;
  readonly features: FeatureVector;
}

/** Scores a single recipe, e.g. for the recipe screen's "why this fits" sheet. */
export function scoreRecipe(recipe: RecipeSummary, ctx: RankContext): RecipeScore {
  const packed = new Float64Array(FEATURE_COUNT);
  const base = writeFeatures(recipe, ctx, packed, 0);
  return {
    base,
    score: finalScore(base, scoreAdjustment(recipe, ctx)),
    fitScore: toFitScore(base),
    features: readFeatures(packed),
  };
}
