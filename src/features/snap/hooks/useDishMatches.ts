/**
 * Catalog recipes closest to a dish read from a photo, and the best healthier version among them.
 * Every search is filtered fail-closed for the person's allergens and diets in SQL, and the results
 * are checked again locally before they are shown.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { hasSafetyAnswers } from '@/domain/types/preferences';
import type { SnapDish } from '@/lib/api/ai';
import { dietMask, searchRecipes, type SearchFilters } from '@/lib/catalog';
import { selectPreferences, selectUnits, usePreferencesStore, useSettingsStore } from '@/stores';

import { toDomainRecipe, toUserPreferences } from '../deps';
import {
  dishSearchQueries,
  mergeDishHits,
  pickHealthierVersion,
  rankCloseRecipes,
  type CloseRecipe,
  type HealthierVersion,
} from '../logic/dishMatch';

export interface DishMatches {
  closest: CloseRecipe[];
  healthier: HealthierVersion | null;
}

export function useDishMatches(resultId: string | null, dish: SnapDish | null) {
  const prefs = usePreferencesStore(selectPreferences);
  const units = useSettingsStore(selectUnits);
  const userPrefs = useMemo(() => toUserPreferences(prefs, units), [prefs, units]);
  const answered = hasSafetyAnswers(userPrefs);

  const query = useQuery({
    queryKey: ['snap', 'dish-matches', resultId, userPrefs],
    queryFn: async (): Promise<DishMatches> => {
      if (!dish) return { closest: [], healthier: null };
      const safety = { allergens: userPrefs.allergens, diets: userPrefs.diets };
      const filters: SearchFilters = {
        avoidAllergens: userPrefs.allergens ?? [],
        dietMask: dietMask(userPrefs.diets ?? []),
      };
      const results = await Promise.all(
        dishSearchQueries(dish).map(async (query) => {
          const page = await searchRecipes(query.text, filters, 0);
          return { query, recipes: page.items.map(toDomainRecipe) };
        }),
      );
      const closest = rankCloseRecipes(mergeDishHits(results), dish, safety);
      const healthier = pickHealthierVersion(closest, dish.nutrition, userPrefs.goals);
      return {
        closest: healthier
          ? closest.filter((entry) => entry.recipe.id !== healthier.recipe.id)
          : closest,
        healthier,
      };
    },
    enabled: answered && dish != null && resultId != null,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    networkMode: 'always',
    refetchOnWindowFocus: false,
  });

  return { ...query, answered };
}
