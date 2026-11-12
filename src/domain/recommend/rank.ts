/**
 * Scores many candidates at once into typed arrays and sorts them. This is the hot path behind the
 * Discover deck, so it avoids per-candidate allocation and never parses or validates data.
 */
import { FEATURE_COUNT } from './config';
import { createRankContext, type RankContext, type RankInput } from './context';
import {
  finalScore,
  readFeatures,
  scoreAdjustment,
  toFitScore,
  writeFeatures,
  type FeatureVector,
} from './score';
import { isRecipeSafe } from '../safety/checkRecipe';
import { type RecipeSummary } from '../types/recipe';

export interface ScoredCandidates {
  readonly count: number;
  /** Weighted feature sum per candidate (drives the fit score). */
  readonly base: Float64Array;
  /** Base plus freshness adjustments (drives ordering and sampling). */
  readonly score: Float64Array;
  /** Packed features, `FEATURE_COUNT` per candidate. */
  readonly features: Float64Array;
}

export function scoreCandidates(
  candidates: readonly RecipeSummary[],
  ctx: RankContext,
): ScoredCandidates {
  const count = candidates.length;
  const base = new Float64Array(count);
  const score = new Float64Array(count);
  const features = new Float64Array(count * FEATURE_COUNT);
  for (let i = 0; i < count; i++) {
    const recipe = candidates[i]!;
    const b = writeFeatures(recipe, ctx, features, i * FEATURE_COUNT);
    base[i] = b;
    score[i] = finalScore(b, scoreAdjustment(recipe, ctx));
  }
  return { count, base, score, features };
}

/**
 * Indices sorted by `keys` descending. Ties fall back to `tieBreak` ascending (recipe ids), so the
 * order never depends on how the engine sorts equal values.
 */
export function sortIndices(keys: Float64Array, tieBreak: readonly string[]): Uint32Array {
  const order = new Uint32Array(keys.length);
  for (let i = 0; i < order.length; i++) order[i] = i;
  order.sort((a, b) => {
    const diff = keys[b]! - keys[a]!;
    if (diff !== 0) return diff;
    const ia = tieBreak[a]!;
    const ib = tieBreak[b]!;
    return ia < ib ? -1 : ia > ib ? 1 : 0;
  });
  return order;
}

export interface RankedRecipe<R extends RecipeSummary = RecipeSummary> {
  readonly recipe: R;
  readonly score: number;
  readonly fitScore: number;
  readonly features: FeatureVector;
}

/**
 * Safe candidates, best first. Recipes that fail the person's allergen or diet rules are dropped
 * before scoring.
 */
export function rankRecipes<R extends RecipeSummary>(
  candidates: readonly R[],
  input: RankInput,
  limit = Number.POSITIVE_INFINITY,
): RankedRecipe<R>[] {
  const ctx = createRankContext(input, candidates);
  const safe = candidates.filter((recipe) => isRecipeSafe(recipe, ctx.safety));
  const scored = scoreCandidates(safe, ctx);
  const order = sortIndices(
    scored.score,
    safe.map((recipe) => recipe.id),
  );
  const take = Math.min(order.length, Math.max(0, limit));
  const out: RankedRecipe<R>[] = [];
  for (let k = 0; k < take; k++) {
    const i = order[k]!;
    out.push({
      recipe: safe[i]!,
      score: scored.score[i]!,
      fitScore: toFitScore(scored.base[i]!),
      features: readFeatures(scored.features, i * FEATURE_COUNT),
    });
  }
  return out;
}
