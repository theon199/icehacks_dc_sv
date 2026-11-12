/**
 * Catalog recipes named in a Chef message, screened against the person's preferences as they are
 * now. A recipe that was fine when Chef suggested it disappears once it no longer fits (a newly
 * declared allergen, say), and ids the catalog does not know never render.
 */
import { useMemo } from 'react';

import type { RecipeSummary } from '@/lib/catalog';
import { selectPreferences, usePreferencesStore } from '@/stores';

import { safetyPrefsFrom, useRecipes } from '../deps';
import { finderFor, screenSuggestedIds } from '../logic/screening';

const NONE: readonly RecipeSummary[] = [];

export function useScreenedRecipes(ids: readonly string[]): readonly RecipeSummary[] {
  const prefs = usePreferencesStore(selectPreferences);
  const { data } = useRecipes(ids);
  return useMemo(() => {
    if (!data || ids.length === 0) return NONE;
    return screenSuggestedIds(ids, finderFor(data), safetyPrefsFrom(prefs)).safe;
  }, [data, ids, prefs]);
}
