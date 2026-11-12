/**
 * Recipes the person can make from their pantry. Ranking runs over up to 1,200 candidates, so it
 * never runs during render: it waits until interactions settle and lands in state. It reruns only
 * when the set of catalog ingredients on hand changes (not when a quantity, unit, use-by date or
 * shelf is edited) or when preferences change.
 */
import { useEffect, useMemo, useState } from 'react';
import { InteractionManager } from 'react-native';

import { useCandidates, useIngredients, type CandidateFilters } from '@/lib/catalog';
import { createSelector } from '@/stores/memo';
import { selectPantryIngredientIds, usePantryStore } from '@/stores/pantry';
import { selectDietMask, selectPreferences, usePreferencesStore } from '@/stores/preferences';
import { selectUnits, useSettingsStore } from '@/stores/settings';

import { toRankPreferences } from './deps';
import { rankPantryMeals, type PantryMeal, type PantryMealsInput } from './pantryMeals';

/** Enough of the catalog to find pantry matches; SQL only pre-filters diets and allergens. */
const CANDIDATE_LIMIT = 1200;
export const PANTRY_MEALS_SHOWN = 8;

export type PantryMealsStatus = 'emptyPantry' | 'needsPreferences' | 'loading' | 'error' | 'ready';

export interface PantryMealsResult {
  readonly status: PantryMealsStatus;
  readonly meals: readonly PantryMeal[];
  readonly retry: () => void;
}

const KEY_SEPARATOR = '\n';

/**
 * The catalog ingredients on hand as one sorted string. A string compares by value, so the
 * component only re-renders, and the ranking only reruns, when that set itself changes.
 */
const selectPantryKey = createSelector(selectPantryIngredientIds, (ids) =>
  [...ids].sort().join(KEY_SEPARATOR),
);

const NO_MEALS: readonly PantryMeal[] = [];

function sameSafetyInputs(a: PantryMealsInput, b: PantryMealsInput): boolean {
  return a.candidates === b.candidates && a.staples === b.staples && a.prefs === b.prefs;
}

export function usePantryMeals(): PantryMealsResult {
  const pantryKey = usePantryStore(selectPantryKey);
  const prefs = usePreferencesStore(selectPreferences);
  const dietMask = usePreferencesStore(selectDietMask);
  const units = useSettingsStore(selectUnits);
  // Ranking reads the clock for recency; one instant per visit keeps the order steady.
  const [now] = useState(() => Date.now());

  const pantry = useMemo<ReadonlySet<string>>(
    () => new Set(pantryKey ? pantryKey.split(KEY_SEPARATOR) : []),
    [pantryKey],
  );
  // Both safety answers are needed: allergens, and diets (answered once onboarding finished).
  const answered = prefs.allergensAnswered && prefs.onboardedAt != null;
  const filters = useMemo<CandidateFilters>(
    () => ({ dietMask, avoidAllergens: prefs.allergens, limit: CANDIDATE_LIMIT }),
    [dietMask, prefs.allergens],
  );
  const enabled = answered && pantry.size > 0;
  const candidates = useCandidates(filters, { enabled });

  // Staple flags live on ingredient rows. The id list depends only on the candidates, so this
  // query runs once per candidate set and is then served from the query cache.
  const ingredientIds = useMemo(() => {
    const ids = new Set<string>();
    for (const candidate of candidates.data ?? []) {
      for (const id of candidate.ingredientIds) ids.add(id);
    }
    return [...ids].sort();
  }, [candidates.data]);
  const ingredients = useIngredients(enabled ? ingredientIds : []);
  const staples = useMemo(
    () => new Set((ingredients.data ?? []).filter((i) => i.pantryStaple).map((i) => i.id)),
    [ingredients.data],
  );

  const rankPrefs = useMemo(() => toRankPreferences(prefs, units), [prefs, units]);
  const input = useMemo<PantryMealsInput | null>(() => {
    if (!enabled || !candidates.data || !ingredients.data) return null;
    return {
      candidates: candidates.data,
      staples,
      pantry,
      prefs: rankPrefs,
      now,
      size: PANTRY_MEALS_SHOWN,
    };
  }, [enabled, candidates.data, ingredients.data, staples, pantry, rankPrefs, now]);

  const [ranked, setRanked] = useState<{
    readonly input: PantryMealsInput;
    readonly meals: readonly PantryMeal[];
  } | null>(null);
  useEffect(() => {
    if (!input) return undefined;
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) setRanked({ input, meals: rankPantryMeals(input) });
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [input]);

  let status: PantryMealsStatus;
  if (pantry.size === 0) status = 'emptyPantry';
  else if (!answered) status = 'needsPreferences';
  else if (candidates.isError || ingredients.isError) status = 'error';
  // While a pantry change is re-ranked the previous list stays up. Anything else (first load,
  // new candidates, changed preferences) waits for its own ranking, so a list ranked under old
  // allergen or diet answers is never shown.
  else if (!input || !ranked || !sameSafetyInputs(ranked.input, input)) status = 'loading';
  else status = 'ready';

  return {
    status,
    meals: status === 'ready' && ranked ? ranked.meals : NO_MEALS,
    retry: () => {
      if (candidates.isError) void candidates.refetch();
      if (ingredients.isError) void ingredients.refetch();
    },
  };
}
