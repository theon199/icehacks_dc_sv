/**
 * Ranked, safety-screened recipes in the shapes the two planners take. Ranking goes through the
 * recommender's `rankRecipes`, which drops anything that fails the person's allergen or diet rules
 * (fail-closed for unknown allergen data) before scoring, so neither planner ever sees an unsafe
 * recipe.
 */
import type { DayPlanCandidate, FillCandidate } from '@/domain/plan';
import { rankRecipes, type RankInput, type RankedRecipe } from '@/domain/recommend';
import type { RecipeSummary as DomainRecipeSummary } from '@/domain/types';
import type { RecipeCandidate } from '@/lib/catalog';

import { toDomainRecipe, toNutritionFacts } from '../deps';

export type Ranked = RankedRecipe<DomainRecipeSummary>;

/** Best first; unsafe recipes are already gone. */
export function rankForPlanning(
  candidates: readonly RecipeCandidate[],
  input: RankInput,
  limit?: number,
): Ranked[] {
  return rankRecipes(candidates.map(toDomainRecipe), input, limit);
}

export function toFillCandidates(ranked: readonly Ranked[]): FillCandidate[] {
  return ranked.map(({ recipe, score }) => ({
    id: recipe.id,
    score,
    cuisine: recipe.cuisine,
    course: recipe.course,
    total_minutes: recipe.totalMinutes,
    ingredientIds: recipe.coreIngredientIds,
    goal_tags: recipe.goalTags,
    gentle: recipe.gentle,
  }));
}

/** Recipes with usable nutrition only; the score is rescaled to the planner's 0..1 range. */
export function toDayPlanCandidates(ranked: readonly Ranked[]): DayPlanCandidate[] {
  const out: DayPlanCandidate[] = [];
  for (const { recipe, score } of ranked) {
    if (recipe.nutritionConfidence === 'none' || recipe.nutrition.kcal == null) continue;
    out.push({
      id: recipe.id,
      course: recipe.course,
      nutrition: toNutritionFacts(recipe.nutrition),
      score: Math.min(1, Math.max(0, score)),
    });
  }
  return out;
}

/** Display lookup from a ranking. */
export function byId(ranked: readonly Ranked[]): ReadonlyMap<string, DomainRecipeSummary> {
  return new Map(ranked.map((r) => [r.recipe.id, r.recipe]));
}
