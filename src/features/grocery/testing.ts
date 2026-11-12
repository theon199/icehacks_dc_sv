/**
 * Shared fixtures for the grocery tests: a small catalog, a recipe and price answers.
 */
import type { ShoppingIngredient, ShoppingRecipe } from '@/domain/shopping';
import type { IngredientPrice } from '@/lib/api/commerce';
import type { Ingredient, RecipeDetail } from '@/lib/catalog';

export function priced(
  ingredientId: string,
  priceCents: number,
  packageQty: number | null,
  unit: string,
  extra: Partial<IngredientPrice> = {},
): IngredientPrice {
  return {
    ingredientId,
    status: 'priced',
    priceCents,
    currency: 'USD',
    packageQty,
    unit,
    retailer: 'Corner Market',
    url: `https://shop.example.com/p/${ingredientId}`,
    confidence: 'listed',
    fetchedAt: '2026-11-03T15:00:00.000Z',
    ...extra,
  };
}

export function answer(
  ingredientId: string,
  status: 'pending' | 'not_found' | 'unavailable',
): IngredientPrice {
  return {
    ingredientId,
    status,
    priceCents: null,
    currency: 'USD',
    packageQty: null,
    unit: null,
    retailer: null,
    url: null,
    confidence: null,
    fetchedAt: status === 'not_found' ? '2026-11-03T15:00:00.000Z' : null,
  };
}

/** Catalog ingredients the fixtures use. */
export const CATALOG_INGREDIENTS: readonly Ingredient[] = [
  ingredient('flour', 'flour', { cup: 125 }),
  ingredient('egg', 'egg', { each: 50 }),
  ingredient('salt', 'salt', { tsp: 6 }, true),
  ingredient('tahini', 'tahini', { tbsp: 15 }),
  ingredient('milk', 'milk', { cup: 245 }),
];

function ingredient(
  id: string,
  name: string,
  gramsPerUnit: Record<string, number>,
  pantryStaple = false,
): Ingredient {
  return {
    id,
    name,
    plural: null,
    category: 'other',
    aisle: null,
    fdcId: null,
    allergens: [],
    allergenStatus: 'resolved',
    dietFlags: 0,
    pantryStaple,
    gramsPerUnit,
  };
}

export const SHOPPING_INGREDIENTS: Readonly<Record<string, ShoppingIngredient>> =
  Object.fromEntries(
    CATALOG_INGREDIENTS.map((i) => [
      i.id,
      {
        id: i.id,
        name: i.name,
        plural: i.plural,
        aisle: i.aisle,
        pantry_staple: i.pantryStaple,
        grams_per_unit: i.gramsPerUnit,
      },
    ]),
  );

/** Serves 4: 500 g flour, 3 eggs, 1 tsp salt (staple), 2 tbsp tahini, parsley (unmatched). */
export const PANCAKE_LINES: ShoppingRecipe['ingredients'] = [
  { ingredient_id: 'flour', text: '500 g flour', quantity: 500, unit: 'g' },
  { ingredient_id: 'egg', text: '3 eggs', quantity: 3, unit: null },
  { ingredient_id: 'salt', text: '1 tsp salt', quantity: 1, unit: 'tsp' },
  { ingredient_id: 'tahini', text: '2 tbsp tahini', quantity: 2, unit: 'tbsp' },
  { ingredient_id: null, text: 'fresh parsley', quantity: null, unit: null },
];

export const PANCAKE_RECIPE: RecipeDetail = {
  id: 'famara:pancakes',
  slug: 'pancakes',
  title: 'Tahini pancakes',
  summary: 'Fluffy pancakes.',
  cuisine: 'american',
  region: 'north_america',
  course: 'breakfast',
  totalMinutes: 20,
  activeMinutes: 15,
  servings: 4,
  effort: 1,
  imageUrl: null,
  imageCredit: null,
  sourceName: 'Famara',
  sourceUrl: null,
  license: 'public domain',
  nutritionConfidence: 'none',
  nutrition: null,
  allergens: {
    milk: 'free',
    egg: 'contains',
    fish: 'free',
    shellfish: 'free',
    tree_nut: 'free',
    peanut: 'free',
    wheat: 'contains',
    soy: 'free',
    sesame: 'contains',
    gluten: 'contains',
  },
  dietFlags: 0,
  goalTags: [],
  gentle: false,
  healthScore: 0.5,
  familyId: 'pancakes',
  ingredients: PANCAKE_LINES.map((line, index) => ({
    position: index + 1,
    ingredientId: line.ingredient_id,
    text: line.text,
    quantity: line.quantity,
    unit: line.unit,
    grams: null,
    section: null,
    optional: false,
  })),
  steps: [],
  tutorials: [],
};
