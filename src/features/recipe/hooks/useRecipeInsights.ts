/**
 * Everything personal the recipe screens derive from one catalog recipe: ingredient facts, swap
 * suggestions, the fit score with its reasons and breakdown, and the safety verdict. Catalog reads
 * go through the shared react-query hooks, so the detail screen and the "why" sheet share caches.
 */
import { useMemo, useState } from 'react';

import {
  checkRecipe,
  createRankContext,
  explainRecipe,
  scoreRecipe,
  type FitReason,
  type RecipeScore,
  type RecipeSummary as DomainRecipe,
  type SafetyVerdict,
  type TasteFeatures,
} from '@/domain';
import {
  coreIngredientIdsOf,
  useIngredients,
  useRecipes,
  useSubstitutions,
  type Ingredient,
  type RecipeDetail,
} from '@/lib/catalog';
import { selectFeedbackEvents, useFeedbackStore } from '@/stores';

import { useDomainPreferences, usePantryIds } from './usePersonalContext';
import { toDomainFeedback, toDomainRecipe } from '../model/adapters';
import { fitBreakdown, type FitFactor } from '../model/fit';
import { suggestSubstitutions, type SubstitutionSuggestion } from '../model/substitutions';

const EMPTY_IDS: readonly string[] = [];
const EMPTY_INGREDIENTS: ReadonlyMap<string, Ingredient> = new Map();
/** Recipes from recent feedback used to learn taste; earlier ones barely count after decay. */
const HISTORY_LIMIT = 150;

function uniqueIngredientIds(recipe: RecipeDetail | null | undefined): string[] {
  if (!recipe) return [];
  const ids = new Set<string>();
  for (const line of recipe.ingredients) if (line.ingredientId) ids.add(line.ingredientId);
  return [...ids].sort();
}

function indexById(list: readonly Ingredient[] | undefined): ReadonlyMap<string, Ingredient> {
  if (!list || list.length === 0) return EMPTY_INGREDIENTS;
  return new Map(list.map((item) => [item.id, item]));
}

/** Catalog facts for each matched ingredient in the recipe. */
export function useRecipeIngredients(recipe: RecipeDetail | null | undefined) {
  const ids = useMemo(() => uniqueIngredientIds(recipe), [recipe]);
  const query = useIngredients(ids.length > 0 ? ids : EMPTY_IDS);
  const byId = useMemo(() => indexById(query.data), [query.data]);
  return { ids, byId, isLoading: query.isLoading && ids.length > 0 };
}

/** Swap suggestions per ingredient id, filtered for this person. */
export function useSwapSuggestions(
  ids: readonly string[],
  ingredients: ReadonlyMap<string, Ingredient>,
): ReadonlyMap<string, SubstitutionSuggestion[]> {
  const prefs = useDomainPreferences();
  const subs = useSubstitutions(ids);
  const replacementIds = useMemo(() => {
    const out = new Set<string>();
    for (const sub of subs.data ?? []) if (!ingredients.has(sub.toId)) out.add(sub.toId);
    return [...out].sort();
  }, [subs.data, ingredients]);
  const replacements = useIngredients(replacementIds);
  return useMemo(() => {
    if (!subs.data || subs.data.length === 0) return new Map();
    const all = new Map(ingredients);
    for (const item of replacements.data ?? []) all.set(item.id, item);
    return suggestSubstitutions(subs.data, all, prefs);
  }, [subs.data, ingredients, replacements.data, prefs]);
}

function useTasteHistory(): {
  feedback: ReturnType<typeof toDomainFeedback>;
  history: ReadonlyMap<string, TasteFeatures>;
} {
  const events = useFeedbackStore(selectFeedbackEvents);
  const feedback = useMemo(() => toDomainFeedback(events), [events]);
  const ids = useMemo(() => {
    const out = new Set<string>();
    for (let i = feedback.length - 1; i >= 0 && out.size < HISTORY_LIMIT; i--) {
      out.add(feedback[i]!.recipeId);
    }
    return [...out].sort();
  }, [feedback]);
  const summaries = useRecipes(ids);
  const history = useMemo(() => {
    const map = new Map<string, TasteFeatures>();
    for (const s of summaries.data ?? []) {
      map.set(s.id, { id: s.id, cuisine: s.cuisine, goalTags: s.goalTags, coreIngredientIds: [] });
    }
    return map;
  }, [summaries.data]);
  return { feedback, history };
}

export interface RecipeFit {
  readonly recipe: DomainRecipe;
  readonly score: RecipeScore;
  readonly reasons: readonly FitReason[];
  readonly factors: readonly FitFactor[];
  readonly safety: SafetyVerdict;
}

/** Fit score, reasons, per-factor breakdown and safety verdict for this person. */
export function useRecipeFit(
  recipe: RecipeDetail | null | undefined,
  ingredients: ReadonlyMap<string, Ingredient>,
): RecipeFit | null {
  const prefs = useDomainPreferences();
  const pantry = usePantryIds();
  const { feedback, history } = useTasteHistory();
  // Fixed for the life of the screen: decay and recency are measured from when it opened.
  const [openedAt] = useState(() => Date.now());
  return useMemo(() => {
    if (!recipe) return null;
    const domain = toDomainRecipe(recipe, coreIngredientIdsOf(recipe.ingredients, ingredients));
    const ctx = createRankContext({ prefs, now: openedAt, feedback, pantry, history }, [domain]);
    const score = scoreRecipe(domain, ctx);
    return {
      recipe: domain,
      score,
      reasons: explainRecipe(domain, score.features, ctx),
      factors: fitBreakdown(domain, score, ctx),
      safety: checkRecipe(domain, ctx.safety),
    };
  }, [recipe, ingredients, prefs, pantry, feedback, history, openedAt]);
}
