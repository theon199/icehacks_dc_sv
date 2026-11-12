/**
 * "Meals you can make" for the current pantry. Candidates are read from the catalog once per diet
 * and allergen answer (SQL drops anything not verified free of the person's allergens), turned into
 * the domain shape, then ranked off the render path inside the query.
 */
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { RecipeSummary } from '@/domain/types/recipe';
import {
  dietMask,
  getIngredients,
  listCandidates,
  type AllergenId,
  type DietId,
} from '@/lib/catalog';
import {
  selectPantryIngredientIds,
  selectPreferences,
  selectUnits,
  usePantryStore,
  usePreferencesStore,
  useSettingsStore,
} from '@/stores';

import { toDomainRecipe, toUserPreferences } from '../deps';
import { mealsFromPantry } from '../logic/pantryMeals';

/** Enough of the catalog to find good matches without slowing the ranking down. */
const CANDIDATE_LIMIT = 2000;

const catalogOptions = {
  staleTime: Infinity,
  gcTime: 10 * 60_000,
  networkMode: 'always',
  refetchOnWindowFocus: false,
} as const;

async function loadCandidates(
  diets: readonly DietId[],
  allergens: readonly AllergenId[],
): Promise<RecipeSummary[]> {
  const list = await listCandidates({
    excludeDietMask: dietMask(diets),
    avoidAllergens: allergens,
    limit: CANDIDATE_LIMIT,
  });
  const ingredientIds = [...new Set(list.flatMap((recipe) => recipe.ingredientIds))];
  const ingredients = await getIngredients(ingredientIds);
  const staples = new Set(ingredients.filter((i) => i.pantryStaple).map((i) => i.id));
  return list.map((recipe) => toDomainRecipe(recipe, staples));
}

const sortedKey = (ids: Iterable<string>) => [...ids].sort().join(',');

/** `snappedIds`: ingredient ids of the items just added from the photo. */
export function usePantryMeals(snappedIds: readonly string[], enabled: boolean) {
  const prefs = usePreferencesStore(selectPreferences);
  const units = useSettingsStore(selectUnits);
  const pantryIds = usePantryStore(selectPantryIngredientIds);
  const queryClient = useQueryClient();

  const userPrefs = useMemo(() => toUserPreferences(prefs, units), [prefs, units]);
  const answered = userPrefs.allergens !== null && userPrefs.diets !== null;
  const diets = userPrefs.diets ?? [];
  const allergens = userPrefs.allergens ?? [];
  const candidateKey = ['snap', 'pantry-candidates', sortedKey(diets), sortedKey(allergens)];

  const query = useQuery({
    ...catalogOptions,
    queryKey: [
      'snap',
      'pantry-meals',
      candidateKey,
      sortedKey(pantryIds),
      sortedKey(snappedIds),
      userPrefs,
    ],
    queryFn: async () => {
      const candidates = await queryClient.ensureQueryData({
        ...catalogOptions,
        queryKey: candidateKey,
        queryFn: () => loadCandidates(diets, allergens),
      });
      return mealsFromPantry({
        candidates,
        prefs: userPrefs,
        pantryIds,
        snappedIds: new Set(snappedIds),
        now: Date.now(),
      });
    },
    enabled: enabled && answered,
    placeholderData: keepPreviousData,
  });

  return { ...query, answered };
}
