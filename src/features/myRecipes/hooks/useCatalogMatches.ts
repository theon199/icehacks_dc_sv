/**
 * Catalog matches for the ingredient names on the Review screen, keyed by `nameKey`. Re-matches
 * as names are edited (after a short pause in typing) and keeps showing the previous matches
 * meanwhile; `isMatching` stays true until the current names are matched.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { matchIngredients, nameKey } from '@/domain/ownRecipes';
import { searchIngredients, type Ingredient } from '@/lib/catalog';

const TYPING_PAUSE_MS = 350;
const EMPTY: ReadonlyMap<string, Ingredient | null> = new Map();

export function useCatalogMatches(names: readonly string[]) {
  const joined = useMemo(
    () => [...new Set(names.map(nameKey).filter((key) => key.length > 0))].sort().join('|'),
    [names],
  );
  const [settled, setSettled] = useState(joined);
  const typing = settled !== joined;
  useEffect(() => {
    if (!typing) return undefined;
    const pause = setTimeout(setSettled, TYPING_PAUSE_MS, joined);
    return () => clearTimeout(pause);
  }, [joined, typing]);
  const query = useQuery({
    queryKey: ['my-recipes', 'ingredient-matches', settled],
    queryFn: () => matchIngredients(settled.split('|'), searchIngredients),
    enabled: settled.length > 0,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    networkMode: 'always',
    placeholderData: keepPreviousData,
  });
  const matches = query.isError ? EMPTY : (query.data ?? EMPTY);
  // A failed lookup ends matching with no matches, so every line reads as unmatched (fail-closed).
  const isMatching =
    typing || query.isFetching || (settled.length > 0 && !query.isSuccess && !query.isError);
  return { matches, isMatching, isError: query.isError, retry: () => void query.refetch() };
}
