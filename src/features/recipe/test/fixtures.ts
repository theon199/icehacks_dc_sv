/** Builders for catalog-shaped test data. Only imported by tests. */
import {
  ALLERGEN_IDS,
  type AllergenId,
  type AllergenStatus,
  type Ingredient,
  type RecipeDetail,
  type RecipeIngredientLine,
} from '@/lib/catalog';
import { defaultPreferences, type Preferences } from '@/stores';

export function allergenMap(
  statuses: Partial<Record<AllergenId, AllergenStatus>> = {},
  fallback: AllergenStatus = 'free',
): Record<AllergenId, AllergenStatus> {
  return Object.fromEntries(ALLERGEN_IDS.map((id) => [id, statuses[id] ?? fallback])) as Record<
    AllergenId,
    AllergenStatus
  >;
}

export function line(
  position: number,
  text: string,
  overrides: Partial<RecipeIngredientLine> = {},
): RecipeIngredientLine {
  return {
    position,
    ingredientId: null,
    text,
    quantity: null,
    unit: null,
    grams: null,
    section: null,
    optional: false,
    ...overrides,
  };
}

export function makeDetail(overrides: Partial<RecipeDetail> = {}): RecipeDetail {
  return {
    id: 'test:1',
    slug: 'test-1',
    title: 'Chickpea curry',
    summary: 'A weeknight curry.',
    cuisine: 'indian',
    region: 'south_asia',
    course: 'main',
    totalMinutes: 30,
    activeMinutes: 15,
    servings: 4,
    effort: 1,
    imageUrl: 'https://example.org/curry.jpg',
    imageCredit: null,
    sourceName: 'Test kitchen',
    sourceUrl: 'https://example.org/curry',
    license: 'test',
    nutritionConfidence: 'computed',
    nutrition: {
      kcal: 420,
      proteinG: 18,
      carbsG: 55,
      fatG: 12,
      satFatG: 3,
      fiberG: 11,
      sugarG: 9,
      addedSugarG: 1,
      sodiumMg: 640,
    },
    allergens: allergenMap(),
    dietFlags: 0,
    goalTags: ['high_fiber'],
    gentle: false,
    healthScore: 0.7,
    familyId: 'fam:curry',
    ingredients: [
      line(1, '2 cups chickpeas', {
        ingredientId: 'chickpea',
        quantity: 2,
        unit: 'cup',
        grams: 330,
      }),
      line(2, '1 onion, chopped', { ingredientId: 'onion', quantity: 1, grams: 110 }),
      line(3, '2 eggs', { ingredientId: 'egg', quantity: 2, grams: 100 }),
      line(4, 'Salt to taste', { ingredientId: 'salt' }),
    ],
    steps: [
      { position: 1, text: 'Fry the onion.', timerSeconds: null },
      { position: 2, text: 'Simmer 20 minutes.', timerSeconds: 1200 },
    ],
    tutorials: [],
    ...overrides,
  };
}

export function ingredient(id: string, overrides: Partial<Ingredient> = {}): Ingredient {
  return {
    id,
    name: id.replace(/_/g, ' '),
    plural: null,
    category: 'other',
    aisle: null,
    fdcId: null,
    allergens: [],
    allergenStatus: 'resolved',
    dietFlags: 0,
    pantryStaple: false,
    gramsPerUnit: {},
    ...overrides,
  };
}

export function prefs(overrides: Partial<Preferences> = {}): Preferences {
  return { ...defaultPreferences, allergensAnswered: true, ...overrides };
}
