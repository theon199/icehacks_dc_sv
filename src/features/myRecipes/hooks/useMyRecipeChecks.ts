/**
 * Every saved recipe checked against the person's current allergens, diets and catalog data, with
 * its pantry coverage and the list section it belongs in.
 *
 * Fail-closed: until the catalog facts have loaded nothing counts as cleared, and if they cannot
 * be loaded every line reads as unmatched.
 */
import { useMemo } from 'react';

import {
  checkOwnRecipe,
  isClearedForSuggestions,
  pantryCoverage,
  sectionOf,
  type CatalogFacts,
  type OwnRecipeSafety,
  type OwnRecipeSection,
  type PantryCoverage,
} from '@/domain/ownRecipes';
import type { SafetyPrefs } from '@/domain/safety';
import { useIngredients } from '@/lib/catalog';
import {
  selectMyRecipeList,
  selectPantryItems,
  selectPreferences,
  useMyRecipesStore,
  usePantryStore,
  usePreferencesStore,
  type MyRecipe,
  type PantryItem,
} from '@/stores';

import { toSafetyPrefs } from '../deps';

export interface MyRecipeCheck {
  recipe: MyRecipe;
  safety: OwnRecipeSafety;
  coverage: PantryCoverage;
  cleared: boolean;
  section: OwnRecipeSection;
}

export type CatalogStatus = 'loading' | 'ready' | 'error';

const NO_FACTS: ReadonlyMap<string, CatalogFacts> = new Map();

/** The person's allergen and diet answers as the safety check reads them. */
export function useSafetyPrefs(): SafetyPrefs {
  const prefs = usePreferencesStore(selectPreferences);
  return useMemo(() => toSafetyPrefs(prefs), [prefs]);
}

/** Catalog facts for a set of ingredient ids, and the staples among them. */
export function useCatalogFacts(ids: readonly string[]) {
  const query = useIngredients(ids);
  const facts = useMemo(() => {
    if (!query.data) return NO_FACTS;
    return new Map<string, CatalogFacts>(query.data.map((item) => [item.id, item]));
  }, [query.data]);
  const staples = useMemo(
    () => new Set([...facts.values()].filter((item) => item.pantryStaple).map((item) => item.id)),
    [facts],
  );
  const status: CatalogStatus =
    ids.length === 0 || query.isSuccess ? 'ready' : query.isError ? 'error' : 'loading';
  return { facts, staples, status, retry: () => void query.refetch() };
}

export function checkMyRecipe(
  recipe: MyRecipe,
  facts: ReadonlyMap<string, CatalogFacts>,
  staples: ReadonlySet<string>,
  prefs: SafetyPrefs,
  pantry: readonly PantryItem[],
  catalogReady: boolean,
): MyRecipeCheck {
  const safety = checkOwnRecipe({
    ingredients: recipe.ingredients,
    catalog: facts,
    prefs,
    confirmations: recipe.confirmations,
  });
  const coverage = pantryCoverage(recipe.ingredients, pantry, staples);
  const cleared = catalogReady && isClearedForSuggestions(safety);
  return { recipe, safety, coverage, cleared, section: sectionOf(cleared, coverage) };
}

function idsOf(recipes: readonly MyRecipe[]): string[] {
  const ids = new Set<string>();
  for (const recipe of recipes) {
    for (const line of recipe.ingredients) {
      if (line.catalogIngredientId) ids.add(line.catalogIngredientId);
    }
  }
  return [...ids].sort();
}

/** All saved recipes, checked. */
export function useMyRecipeChecks() {
  const recipes = useMyRecipesStore(selectMyRecipeList);
  const pantry = usePantryStore(selectPantryItems);
  const prefs = useSafetyPrefs();
  const ids = useMemo(() => idsOf(recipes), [recipes]);
  const { facts, staples, status, retry } = useCatalogFacts(ids);
  const checks = useMemo(
    () =>
      recipes.map((recipe) =>
        checkMyRecipe(recipe, facts, staples, prefs, pantry, status === 'ready'),
      ),
    [recipes, facts, staples, prefs, pantry, status],
  );
  return { checks, status, retry };
}

/** One saved recipe, checked; null when it does not exist (deleted, or never synced here). */
export function useMyRecipeCheck(id: string | null) {
  const recipe = useMyRecipesStore((state) => (id ? (state.recipes[id] ?? null) : null));
  const pantry = usePantryStore(selectPantryItems);
  const prefs = useSafetyPrefs();
  const ids = useMemo(() => (recipe ? idsOf([recipe]) : []), [recipe]);
  const { facts, staples, status, retry } = useCatalogFacts(ids);
  const check = useMemo(
    () =>
      recipe ? checkMyRecipe(recipe, facts, staples, prefs, pantry, status === 'ready') : null,
    [recipe, facts, staples, prefs, pantry, status],
  );
  return { check, status, retry, prefs, facts };
}
