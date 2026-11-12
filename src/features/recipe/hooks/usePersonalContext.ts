/**
 * What the recipe screens need to know about the person, read from the stores with narrow
 * selectors and converted once into domain shapes.
 */
import { useMemo } from 'react';

import type { UserPreferences } from '@/domain';
import { dailyTargets, type DailyTargets } from '@/domain/nutrition';
import {
  selectPantryIngredientIds,
  selectPersonalDetails,
  selectPreferences,
  selectUnits,
  usePantryStore,
  usePersonalDetailsStore,
  usePreferencesStore,
  useSettingsStore,
} from '@/stores';

import { useAge } from '../deps';
import {
  targetGoalTags,
  toDomainGoals,
  toDomainPreferences,
  toTargetDetails,
} from '../model/adapters';

/** Preferences in the domain's shape, with the person's unit system. */
export function useDomainPreferences(): UserPreferences {
  const prefs = usePreferencesStore(selectPreferences);
  const units = useSettingsStore(selectUnits);
  return useMemo(() => toDomainPreferences(prefs, units), [prefs, units]);
}

/** Catalog ingredient ids the person has at home. */
export function usePantryIds(): ReadonlySet<string> {
  return usePantryStore(selectPantryIngredientIds);
}

/** Daily nutrient targets from personal details when given, else the reference diet. */
export function useDailyTargets(): DailyTargets {
  const details = usePersonalDetailsStore(selectPersonalDetails);
  const goals = usePreferencesStore((state) => state.prefs.goals);
  const age = useAge();
  return useMemo(
    () =>
      dailyTargets(toTargetDetails(details, age), {
        goals: targetGoalTags(toDomainGoals(goals)),
      }),
    [details, goals, age],
  );
}
