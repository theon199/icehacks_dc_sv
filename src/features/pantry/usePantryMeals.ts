/**
 * Recipes the person can make from their pantry, ranked once per pantry or preference change.
 */
import { useMemo, useState } from 'react';

import { useCandidates, useIngredients, type CandidateFilters } from '@/lib/catalog';
import { selectPantryIngredientIds, usePantryStore } from '@/stores/pantry';
import { selectDietMask, selectPreferences, usePreferencesStore } from '@/stores/preferences';
import { selectUnits, useSettingsStore } from '@/stores/settings';

import { toRankPreferences } from './deps';
import { rankPantryMeals, type PantryMeal } from './pantryMeals';

/** Enough of the catalog to find pantry matches; SQL only pre-filters diets and allergens. */
const CANDIDATE_LIMIT = 1200;
export const PANTRY_MEALS_SHOWN = 8;

export type PantryMealsStatus = 'emptyPantry' | 'needsPreferences' | 'loading' | 'error' | 'ready';

export interface PantryMealsResult {
  readonly status: PantryMealsStatus;
  readonly meals: readonly PantryMeal[];
  readonly retry: () => void;
}

export function usePantryMeals(): PantryMealsResult {
  const pantry = usePantryStore(selectPantryIngredientIds);
  const prefs = usePreferencesStore(selectPreferences);
  const dietMask = usePreferencesStore(selectDietMask);
  const units = useSettingsStore(selectUnits);
  // Ranking reads the clock for recency; one instant per visit keeps the order steady.
  const [now] = useState(() => Date.now());

  const answered = prefs.allergensAnswered;
  const filters = useMemo<CandidateFilters>(
    () => ({
      excludeDietMask: dietMask,
      avoidAllergens: prefs.allergens,
      limit: CANDIDATE_LIMIT,
    }),
    [dietMask, prefs.allergens],
  );
  const enabled = answered && pantry.size > 0;
  const candidates = useCandidates(filters, { enabled });

  const ingredientIds = useMemo(() => {
    const ids = new Set<string>();
    for (const candidate of candidates.data ?? []) {
      for (const id of candidate.ingredientIds) ids.add(id);
    }
    return [...ids].sort();
  }, [candidates.data]);
  const ingredients = useIngredients(enabled ? ingredientIds : []);

  const meals = useMemo(() => {
    if (!enabled || !candidates.data || !ingredients.data) return [];
    const staples = new Set(ingredients.data.filter((i) => i.pantryStaple).map((i) => i.id));
    return rankPantryMeals({
      candidates: candidates.data,
      staples,
      pantry,
      prefs: toRankPreferences(prefs, units),
      now,
      size: PANTRY_MEALS_SHOWN,
    });
  }, [enabled, candidates.data, ingredients.data, pantry, prefs, units, now]);

  let status: PantryMealsStatus;
  if (pantry.size === 0) status = 'emptyPantry';
  else if (!answered) status = 'needsPreferences';
  else if (candidates.isError || ingredients.isError) status = 'error';
  else if (!candidates.data || (ingredientIds.length > 0 && !ingredients.data)) status = 'loading';
  else status = 'ready';

  return {
    status,
    meals,
    retry: () => {
      if (candidates.isError) void candidates.refetch();
      if (ingredients.isError) void ingredients.refetch();
    },
  };
}
