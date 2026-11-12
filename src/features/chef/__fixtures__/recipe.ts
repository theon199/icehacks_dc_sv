/** Catalog recipe summaries for Chef and makeover tests. */
import type { AllergenMap, AllergenStatus, RecipeDetail, RecipeSummary } from '@/lib/catalog';
import { defaultPreferences, type Preferences } from '@/stores';

const ALL_FREE: AllergenMap = {
  milk: 'free',
  egg: 'free',
  fish: 'free',
  shellfish: 'free',
  tree_nut: 'free',
  peanut: 'free',
  wheat: 'free',
  soy: 'free',
  sesame: 'free',
  gluten: 'free',
};

export function recipe(
  id: string,
  overrides: Partial<Omit<RecipeSummary, 'allergens'>> & {
    allergens?: Partial<Record<keyof AllergenMap, AllergenStatus>>;
  } = {},
): RecipeSummary {
  const { allergens, ...rest } = overrides;
  return {
    id,
    slug: id.replace(/[^a-z0-9]+/gi, '-'),
    title: `Recipe ${id}`,
    summary: '',
    cuisine: 'italian',
    region: 'southern_europe',
    course: 'main',
    totalMinutes: 30,
    activeMinutes: 20,
    servings: 2,
    effort: 1,
    imageUrl: null,
    imageCredit: null,
    sourceName: 'Test',
    sourceUrl: null,
    license: 'CC0',
    nutritionConfidence: 'computed',
    nutrition: {
      kcal: 520,
      proteinG: 31.26,
      carbsG: 40,
      fatG: 12,
      satFatG: 3,
      fiberG: 8,
      sugarG: 5,
      addedSugarG: 0,
      sodiumMg: 600,
    },
    allergens: { ...ALL_FREE, ...allergens },
    dietFlags: 0,
    goalTags: ['high_protein'],
    gentle: false,
    healthScore: 0.7,
    familyId: id,
    ...rest,
  };
}

export function recipeDetail(id: string, overrides: Partial<RecipeDetail> = {}): RecipeDetail {
  return {
    ...recipe(id),
    title: 'Creamy tomato pasta',
    servings: 4,
    ingredients: [
      {
        position: 1,
        ingredientId: 'pasta',
        text: '300 g pasta',
        quantity: 300,
        unit: 'g',
        grams: 300,
        section: null,
        optional: false,
      },
      {
        position: 0,
        ingredientId: 'cream',
        text: '200 ml heavy cream',
        quantity: 200,
        unit: 'ml',
        grams: 200,
        section: null,
        optional: false,
      },
    ],
    steps: [
      { position: 0, text: 'Boil the pasta.', timerSeconds: null },
      { position: 1, text: 'Stir in the cream and serve.', timerSeconds: null },
    ],
    tutorials: [],
    ...overrides,
  };
}

/** Preferences with the safety questions answered. */
export function answeredPrefs(overrides: Partial<Preferences> = {}): Preferences {
  return {
    ...defaultPreferences,
    allergensAnswered: true,
    onboardedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
