/**
 * The person's own recipes for one meal that may be suggested: only those cleared against their
 * current allergens, diet and catalog data (fail-closed), with what they have at home. Recipes
 * they can make right now come first, then those missing the fewest things.
 */
import { useMemo } from 'react';

import type { PantryCoverage } from '@/domain/ownRecipes';
import type { MyRecipe, MyRecipeMeal } from '@/stores';

import { useMyRecipeChecks, type CatalogStatus, type MyRecipeCheck } from './useMyRecipeChecks';

export interface MyRecipeSuggestion {
  recipe: MyRecipe;
  coverage: PantryCoverage;
}

export interface MyRecipesForMeal {
  /** Empty until the safety check can run: nothing is suggested before it is known to be safe. */
  recipes: readonly MyRecipeSuggestion[];
  status: CatalogStatus;
}

/** Pure part of the hook: the cleared recipes for `meal`, best fit first. */
export function suggestionsForMeal(
  checks: readonly MyRecipeCheck[],
  meal: MyRecipeMeal,
): MyRecipeSuggestion[] {
  return checks
    .filter((check) => check.cleared && check.recipe.meal === meal)
    .sort(
      (a, b) =>
        Number(b.coverage.ready) - Number(a.coverage.ready) ||
        a.coverage.missing.length - b.coverage.missing.length ||
        b.coverage.have - a.coverage.have ||
        a.recipe.title.localeCompare(b.recipe.title),
    )
    .map(({ recipe, coverage }) => ({ recipe, coverage }));
}

export function useMyRecipesForMeal(meal: MyRecipeMeal): MyRecipesForMeal {
  const { checks, status } = useMyRecipeChecks();
  const recipes = useMemo(
    () => (status === 'ready' ? suggestionsForMeal(checks, meal) : []),
    [checks, meal, status],
  );
  return { recipes, status };
}
