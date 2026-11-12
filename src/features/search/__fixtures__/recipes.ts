import type { AllergenMap, RecipeSummary } from '@/lib/catalog';

/** Every allergen verified absent. Spelled out so the compiler flags a newly added allergen. */
export const allFree = (): AllergenMap => ({
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
});

/** A plain catalog summary for tests; override what the test is about. */
export function searchRecipe(id: string, overrides: Partial<RecipeSummary> = {}): RecipeSummary {
  return {
    id,
    slug: id.replace(/[^a-z0-9]+/g, '-'),
    title: `Recipe ${id}`,
    summary: 'A test dish.',
    cuisine: 'indian',
    region: 'south_asia',
    course: 'main',
    totalMinutes: 30,
    activeMinutes: 15,
    servings: 2,
    effort: 1,
    imageUrl: null,
    imageCredit: null,
    sourceName: 'Test kitchen',
    sourceUrl: null,
    license: 'public-domain',
    nutritionConfidence: 'computed',
    nutrition: {
      kcal: 420,
      proteinG: 20,
      carbsG: 50,
      fatG: 12,
      satFatG: 2,
      fiberG: 9,
      sugarG: 6,
      addedSugarG: 0,
      sodiumMg: 480,
    },
    allergens: allFree(),
    dietFlags: 0,
    goalTags: [],
    gentle: false,
    healthScore: 0.7,
    familyId: id,
    ...overrides,
  };
}
