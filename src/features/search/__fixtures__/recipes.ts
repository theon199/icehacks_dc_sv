import { ALLERGEN_IDS, type AllergenMap, type RecipeSummary } from '@/lib/catalog';

/** Every allergen verified absent. */
export const allFree = (): AllergenMap =>
  Object.fromEntries(ALLERGEN_IDS.map((id) => [id, 'free'])) as unknown as AllergenMap;

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
