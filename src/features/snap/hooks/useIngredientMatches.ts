/**
 * Catalog matches for the names in a pantry draft, keyed by `nameKey`. Re-matches as names are
 * edited (after a short pause in typing) and keeps showing the previous matches meanwhile.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { searchIngredients, type Ingredient } from '@/lib/catalog';

import { matchIngredients } from '../logic/ingredientMatch';
import { nameKey } from '../logic/words';

const TYPING_PAUSE_MS = 350;

function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

export function useIngredientMatches(names: readonly string[]) {
  // A stable, order-free key: the same set of foods is matched once.
  const joined = useMemo(
    () => [...new Set(names.map(nameKey).filter((key) => key.length > 0))].sort().join('|'),
    [names],
  );
  const settled = useDebounced(joined, TYPING_PAUSE_MS);
  const query = useQuery({
    queryKey: ['snap', 'ingredient-matches', settled],
    queryFn: () => matchIngredients(settled.split('|'), searchIngredients),
    enabled: settled.length > 0,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    networkMode: 'always',
    placeholderData: keepPreviousData,
  });
  const matches: ReadonlyMap<string, Ingredient | null> = query.data ?? EMPTY;
  return { matches, isMatching: query.isFetching || settled !== joined };
}

const EMPTY: ReadonlyMap<string, Ingredient | null> = new Map();
