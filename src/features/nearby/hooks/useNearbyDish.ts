/**
 * Resolves the route param into the dish to search for: a catalog recipe's title and cuisine, or
 * the name itself when the param is not a recipe id.
 */
import { useMemo } from 'react';

import { useRecipe } from '@/lib/catalog';

import { decodeDishParam, looksLikeRecipeId, toNearbyDish, type NearbyDish } from '../model/dish';

export type NearbyDishState =
  { status: 'loading' } | { status: 'ready'; dish: NearbyDish } | { status: 'invalid' };

export function useNearbyDish(param: string): NearbyDishState {
  const raw = decodeDishParam(param).trim();
  const recipeId = looksLikeRecipeId(raw) ? raw : null;
  const recipe = useRecipe(recipeId);

  return useMemo<NearbyDishState>(() => {
    if (recipeId) {
      if (recipe.isPending) return { status: 'loading' };
      const found = recipe.data;
      if (found) {
        const dish = toNearbyDish(found.title, { cuisine: found.cuisine, recipeId: found.id });
        return dish ? { status: 'ready', dish } : { status: 'invalid' };
      }
      // An unknown id is not a dish name either.
      return { status: 'invalid' };
    }
    const dish = toNearbyDish(raw);
    return dish ? { status: 'ready', dish } : { status: 'invalid' };
  }, [recipeId, recipe.isPending, recipe.data, raw]);
}
