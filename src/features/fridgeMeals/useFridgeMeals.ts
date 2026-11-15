/**
 * Meals for now: the person's safe catalog recipes their pantry covers, ranked for breakfast,
 * lunch and dinner in one pass. Ranking runs over up to 1,200 candidates, so it never runs during
 * render: it waits until the JS thread is idle and lands in state. It reruns only when the set of
 * catalog ingredients on hand changes, or when preferences change.
 */
import { useEffect, useMemo, useState } from 'react';

import {
  hasSafetyAnswers,
  MEAL_COURSES,
  rankMealTimes,
  type MealTimeInput,
  type MealTimePicks,
  type RecipeSummary,
} from '@/domain';
import { useCandidates, type CandidateFilters, type RecipeCandidate } from '@/lib/catalog';
import { createSelector } from '@/stores/memo';
import { selectPantryIngredientIds, usePantryStore } from '@/stores/pantry';
import { selectDietMask, selectPreferences, usePreferencesStore } from '@/stores/preferences';
import { selectUnits, useSettingsStore } from '@/stores/settings';

import { toRankPreferences, toRankRecipe } from './deps';

/** Enough of the catalog's meals to find pantry matches; SQL pre-filters diets and allergens. */
const CANDIDATE_LIMIT = 1200;

export type FridgeMealsStatus = 'emptyPantry' | 'needsPreferences' | 'loading' | 'error' | 'ready';

export interface FridgeMealsResult {
  readonly status: FridgeMealsStatus;
  /** Empty for every meal unless `status` is `ready`. */
  readonly picks: MealTimePicks;
  readonly retry: () => void;
}

const KEY_SEPARATOR = '\n';

/** The catalog ingredients on hand as one sorted string, so re-renders follow the set alone. */
const selectPantryKey = createSelector(selectPantryIngredientIds, (ids) =>
  [...ids].sort().join(KEY_SEPARATOR),
);

const NO_PICKS: MealTimePicks = Object.freeze({ breakfast: [], lunch: [], dinner: [] });

type IdleRequest = (callback: () => void, options?: { timeout: number }) => number;
type IdleCancel = (handle: number) => void;

/** Runs `task` once the JS thread is idle, or after a short wait at most; returns a cancel. */
function whenIdle(task: () => void): () => void {
  const scope = globalThis as {
    requestIdleCallback?: IdleRequest;
    cancelIdleCallback?: IdleCancel;
  };
  const request = scope.requestIdleCallback;
  const cancel = scope.cancelIdleCallback;
  if (typeof request === 'function' && typeof cancel === 'function') {
    const handle = request(task, { timeout: 400 });
    return () => cancel(handle);
  }
  const timer = setTimeout(task, 0);
  return () => clearTimeout(timer);
}

interface Ranked {
  readonly input: MealTimeInput;
  readonly candidates: readonly RecipeCandidate[];
  readonly picks: MealTimePicks;
}

export function useFridgeMeals(): FridgeMealsResult {
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
  const rankPrefs = useMemo(() => toRankPreferences(prefs, units), [prefs, units]);
  const answered = hasSafetyAnswers(rankPrefs);
  const filters = useMemo<CandidateFilters>(
    () => ({
      dietMask,
      avoidAllergens: prefs.allergens,
      course: MEAL_COURSES,
      limit: CANDIDATE_LIMIT,
    }),
    [dietMask, prefs.allergens],
  );
  const enabled = answered && pantry.size > 0;
  const candidates = useCandidates(filters, { enabled });
  const data = candidates.data;

  const input = useMemo<MealTimeInput | null>(
    () => (enabled && data ? { prefs: rankPrefs, now, pantry } : null),
    [enabled, data, rankPrefs, now, pantry],
  );

  const [ranked, setRanked] = useState<Ranked | null>(null);
  useEffect(() => {
    if (!input || !data) return undefined;
    return whenIdle(() => {
      const recipes: RecipeSummary[] = data.map(toRankRecipe);
      setRanked({ input, candidates: data, picks: rankMealTimes(recipes, input) });
    });
  }, [input, data]);

  let status: FridgeMealsStatus;
  if (pantry.size === 0) status = 'emptyPantry';
  else if (!answered) status = 'needsPreferences';
  else if (candidates.isError) status = 'error';
  // While a pantry change is re-ranked the previous picks stay up. Anything else (first load, new
  // candidates, changed preferences) waits for its own ranking, so picks ranked under old
  // allergen or diet answers are never shown.
  else if (!input || !ranked || ranked.candidates !== data || ranked.input.prefs !== input.prefs) {
    status = 'loading';
  } else status = 'ready';

  return {
    status,
    picks: status === 'ready' && ranked ? ranked.picks : NO_PICKS,
    retry: () => {
      if (candidates.isError) void candidates.refetch();
    },
  };
}
