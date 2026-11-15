/** Test helpers for My recipes. Only imported by tests. */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { Ingredient } from '@/lib/catalog';
import type { MyRecipe } from '@/stores';

interface ListProps<T> {
  data: readonly T[] | null | undefined;
  renderItem: (info: { item: T; index: number }) => ReactNode;
  keyExtractor?: (item: T, index: number) => string;
}

/** Renders every row in order, so screens can be tested without list virtualisation. */
export function MockFlashList<T>({ data, renderItem, keyExtractor }: ListProps<T>) {
  return (
    <View>
      {(data ?? []).map((item, index) => (
        <View key={keyExtractor ? keyExtractor(item, index) : index}>
          {renderItem({ item, index })}
        </View>
      ))}
    </View>
  );
}

const ALL_DIETS = 511;
/** Diet bits of a meat ingredient: everything but vegetarian, vegan and pescatarian. */
export const MEAT_DIETS = ALL_DIETS & ~(1 | 2 | 4);

export function catalogIngredient(id: string, overrides: Partial<Ingredient> = {}): Ingredient {
  return {
    id,
    name: id.replace(/_/g, ' '),
    plural: null,
    category: 'other',
    aisle: null,
    fdcId: null,
    allergens: [],
    allergenStatus: 'resolved',
    dietFlags: ALL_DIETS,
    pantryStaple: false,
    gramsPerUnit: {},
    ...overrides,
  };
}

export function savedRecipe(id: string, overrides: Partial<MyRecipe> = {}): MyRecipe {
  return {
    id,
    title: 'Garlic fried rice',
    servings: 2,
    minutes: 15,
    cuisine: 'Filipino',
    meal: 'breakfast',
    ingredients: [
      { text: '4 cups cooked rice', name: 'rice', catalogIngredientId: 'rice' },
      { text: '6 cloves garlic', name: 'garlic', catalogIngredientId: 'garlic' },
    ],
    steps: ['Fry the garlic, then the rice.'],
    source: { kind: 'text', url: null },
    safety: { status: 'clear', allergens: [], diets: [], checkedAt: '2026-11-14T10:00:00.000Z' },
    confirmations: [],
    createdAt: '2026-11-14T10:00:00.000Z',
    updatedAt: '2026-11-14T10:00:00.000Z',
    ...overrides,
  };
}

export function pantryItem(ingredientId: string | null, name: string) {
  return {
    id: `p-${name}`,
    ingredientId,
    name,
    qty: null,
    unit: null,
    category: 'other' as const,
    addedAt: '2026-11-13T10:00:00.000Z',
    expiresAt: null,
  };
}
