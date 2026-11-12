/**
 * "Meals you can make" for the current pantry. Candidates are read from the catalog once per diet
 * and allergen answer (SQL drops anything not verified free of the person's allergens), turned into
 * the domain shape, then ranked inside the query once the screen is idle, so ranking a large
 * candidate set never competes with the screen's entrance.
 *
 * Results computed for other allergen or diet answers are never shown while new ones load: the
 * previous list is kept only while the pantry itself changes (fail-closed).
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

type IdleRequest = (callback: () => void, options?: { timeout: number }) => unknown;

/** Resolves once the JS thread is idle (or after a short wait at most). */
function whenIdle(): Promise<void> {
  const requestIdle = (globalThis as { requestIdleCallback?: IdleRequest }).requestIdleCallback;
  return new Promise((resolve) => {
    if (typeof requestIdle === 'function') requestIdle(() => resolve(), { timeout: 400 });
    else setTimeout(resolve, 0);
  });
}

/** Index of the safety part of the meals query key. */
const SAFETY_KEY_INDEX = 2;

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

  // Everything that decides which recipes are safe to show. A change here must not reuse old data.
  const safetyKey = JSON.stringify([candidateKey, userPrefs]);

  const query = useQuery({
    ...catalogOptions,
    queryKey: ['snap', 'pantry-meals', safetyKey, sortedKey(pantryIds), sortedKey(snappedIds)],
    queryFn: async () => {
      const candidates = await queryClient.ensureQueryData({
        ...catalogOptions,
        queryKey: candidateKey,
        queryFn: () => loadCandidates(diets, allergens),
      });
      await whenIdle();
      return mealsFromPantry({
        candidates,
        prefs: userPrefs,
        pantryIds,
        snappedIds: new Set(snappedIds),
        now: Date.now(),
      });
    },
    enabled: enabled && answered,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[SAFETY_KEY_INDEX] === safetyKey ? previous : undefined,
  });

  return { ...query, answered };
}
