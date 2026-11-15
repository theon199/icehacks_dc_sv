/**
 * The catalog's words for the ingredients a meal list names, so a "why" line or a "Need …" tag
 * speaks of real pantry matches. Plural where the catalog has one ("eggs"), the name otherwise
 * ("paneer"). Until the names load, or if they fail, the map is empty and the text counts instead.
 */
import { useMemo } from 'react';

import type { MealTimePick } from '@/domain';
import { useIngredients } from '@/lib/catalog';

import { namedIngredientIds, type IngredientNames } from './mealText';

const NO_NAMES: IngredientNames = new Map();

export function useIngredientNames(
  picks: readonly MealTimePick[],
  topCount: number,
): IngredientNames {
  const key = namedIngredientIds(picks, topCount).join(',');
  const ids = useMemo(() => (key ? key.split(',') : []), [key]);
  const query = useIngredients(ids);
  const data = query.data;
  return useMemo(() => {
    if (!data || data.length === 0) return NO_NAMES;
    return new Map(data.map((ingredient) => [ingredient.id, ingredient.plural ?? ingredient.name]));
  }, [data]);
}
