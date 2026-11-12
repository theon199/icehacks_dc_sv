import { useCallback, useMemo } from 'react';

import { compileSafetyRules, isRecipeSafe, type SafetyRules } from '@/domain/safety';
import { useRecipes, type RecipeSummary } from '@/lib/catalog';
import { selectSavedIds, usePreferencesStore, useSavedStore } from '@/stores';

import { toDomainPreferences } from '../deps';

/** The person's allergen and diet rules, compiled once per preferences change. */
export function useSafetyRules(): SafetyRules {
  const prefs = usePreferencesStore((s) => s.prefs);
  return useMemo(() => compileSafetyRules(toDomainPreferences(prefs)), [prefs]);
}

/** A stable check of one recipe against the person's current allergen and diet rules. */
export function useIsRecipeSafe(): (recipe: RecipeSummary) => boolean {
  const rules = useSafetyRules();
  return useCallback((recipe: RecipeSummary) => isRecipeSafe(recipe, rules), [rules]);
}

/**
 * Saved recipes, most recently saved first, plus a check for ones that no longer fit the person's
 * allergens or diet (preferences can change after saving).
 */
export function useSavedRecipes() {
  const ids = useSavedStore(selectSavedIds);
  const query = useRecipes(ids);
  const isSafe = useIsRecipeSafe();
  // Keep the previous list only while it still matches what is saved (removals show at once).
  const recipes = useMemo(() => {
    if (ids.length === 0) return [];
    const saved = new Set(ids);
    return (query.data ?? []).filter((r) => saved.has(r.id));
  }, [ids, query.data]);
  return {
    ids,
    recipes,
    isSafe,
    isLoading: ids.length > 0 && query.data === undefined && !query.isError,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
