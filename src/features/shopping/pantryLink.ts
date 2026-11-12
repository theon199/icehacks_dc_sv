/**
 * Pantry items typed by hand ("eggs") carry no ingredient id, so the domain would never subtract
 * them from the catalog line they obviously are. Here a free-text item whose name reads exactly
 * like one catalog ingredient (its name or its plural, ignoring case and spacing) is treated as
 * that ingredient. Names shared by two catalog ingredients are left alone rather than guessed.
 */
import type { Ingredient } from '@/lib/catalog';
import type { PantryItem } from '@/stores/pantry';

import { normaliseName } from './freeText';

/** Normalised catalog name or plural → ingredient id; `null` marks a name two ingredients share. */
export type CatalogNameIndex = ReadonlyMap<string, string | null>;

export function catalogNameIndex(
  ingredients: Iterable<Pick<Ingredient, 'id' | 'name' | 'plural'>>,
): CatalogNameIndex {
  const index = new Map<string, string | null>();
  for (const ingredient of ingredients) {
    const names = new Set([ingredient.name, ingredient.plural ?? ''].map(normaliseName));
    for (const name of names) {
      if (!name) continue;
      const seen = index.get(name);
      if (seen === undefined) index.set(name, ingredient.id);
      else if (seen !== ingredient.id) index.set(name, null);
    }
  }
  return index;
}

/** The catalog ingredient a pantry item stands for: its own id, or one found by its name. */
export function linkedIngredientId(item: PantryItem, index: CatalogNameIndex): string | null {
  return item.ingredientId ?? index.get(normaliseName(item.name)) ?? null;
}

/**
 * The pantry as the list reads it: free-text items that name a catalog ingredient carry its id.
 * Returns the same array when nothing links, so memoised callers stay stable.
 */
export function linkPantryItems(
  items: readonly PantryItem[],
  index: CatalogNameIndex,
): readonly PantryItem[] {
  if (index.size === 0) return items;
  let out: PantryItem[] | null = null;
  items.forEach((item, position) => {
    if (item.ingredientId != null) return;
    const ingredientId = linkedIngredientId(item, index);
    if (ingredientId == null) return;
    out ??= items.slice();
    out[position] = { ...item, ingredientId };
  });
  return out ?? items;
}
