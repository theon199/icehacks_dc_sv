/**
 * The catalog facts the coach sends with each question, from the recipe's catalog ingredients.
 * Until they load, or if the lookup fails, every kind counts as unknown, so the coach keeps
 * working and the server stays on the careful side.
 */
import { useMemo } from 'react';

import type { CoachFacts } from '@/lib/api/ai';
import { useIngredients, type Ingredient, type RecipeDetail } from '@/lib/catalog';

import { coachFacts } from '../logic/coachFacts';

export function useCoachFacts(recipe: RecipeDetail): CoachFacts {
  const ids = useMemo(() => {
    const unique = new Set<string>();
    for (const line of recipe.ingredients) if (line.ingredientId) unique.add(line.ingredientId);
    return [...unique].sort();
  }, [recipe.ingredients]);
  const lookup = useIngredients(ids);
  const loaded = ids.length === 0 || lookup.isSuccess;
  const data = lookup.data;
  return useMemo(() => {
    const byId: ReadonlyMap<string, Ingredient> | null = loaded
      ? new Map((data ?? []).map((item) => [item.id, item]))
      : null;
    return coachFacts(recipe, byId);
  }, [data, loaded, recipe]);
}
