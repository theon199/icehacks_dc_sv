/**
 * Small hand-built catalog slices for shopping tests: two recipes that share onions and rice, and
 * the ingredients they use with real catalog aisles.
 */
import type { Ingredient, RecipeIngredientLine } from '@/lib/catalog';
import type { PantryItem } from '@/stores/pantry';

import type { ListRecipe } from '../buildList';

export function ingredient(
  id: string,
  aisle: string | null,
  extra: Partial<Ingredient> = {},
): Ingredient {
  return {
    id,
    name: id.replace(/_/g, ' '),
    plural: null,
    category: 'other',
    aisle,
    fdcId: null,
    allergens: [],
    allergenStatus: 'resolved',
    dietFlags: 0,
    pantryStaple: false,
    gramsPerUnit: {},
    ...extra,
  };
}

export function line(
  position: number,
  ingredientId: string | null,
  quantity: number | null,
  unit: string | null,
  text = `${quantity ?? ''} ${unit ?? ''} ${ingredientId ?? ''}`.trim(),
): RecipeIngredientLine {
  return {
    position,
    ingredientId,
    text,
    quantity,
    unit,
    grams: null,
    section: null,
    optional: false,
  };
}

export const INGREDIENTS: readonly Ingredient[] = [
  ingredient('onion', 'produce', { plural: 'onions', category: 'produce' }),
  ingredient('rice', 'grains_pasta', { category: 'grain', gramsPerUnit: { cup: 185 } }),
  ingredient('chickpea', 'canned_jarred', { category: 'legume' }),
  ingredient('egg', 'dairy_eggs', { plural: 'eggs', category: 'dairy' }),
  ingredient('salt', 'spices', { category: 'spice', pantryStaple: true }),
  ingredient('chicken_breast', 'meat_seafood', { category: 'protein' }),
];

/** Serves 2: one onion, 200 g rice, a can of chickpeas, salt to taste. */
export const CURRY: ListRecipe = {
  id: 'test:curry',
  servings: 2,
  ingredients: [
    line(1, 'onion', 1, null),
    line(2, 'rice', 200, 'g'),
    line(3, 'chickpea', 1, 'can'),
    line(4, 'salt', null, null, 'salt to taste'),
  ],
};

/** Serves 4: two onions, 400 g rice, 4 eggs, 500 g chicken, a handful of fresh coriander. */
export const FRIED_RICE: ListRecipe = {
  id: 'test:fried-rice',
  servings: 4,
  ingredients: [
    line(1, 'onion', 2, null),
    line(2, 'rice', 400, 'g'),
    line(3, 'egg', 4, null),
    line(4, 'chicken_breast', 500, 'g'),
    line(5, null, 1, 'handful', '1 handful fresh coriander'),
  ],
};

export const RECIPES: ReadonlyMap<string, ListRecipe> = new Map([
  [CURRY.id, CURRY],
  [FRIED_RICE.id, FRIED_RICE],
]);

export function pantryItem(
  id: string,
  ingredientId: string | null,
  qty: number | null,
  unit: string | null = null,
): PantryItem {
  return {
    id,
    ingredientId,
    name: ingredientId ?? id,
    qty,
    unit,
    category: 'other',
    addedAt: '2026-11-01T00:00:00.000Z',
    expiresAt: null,
  };
}
