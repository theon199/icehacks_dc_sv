/**
 * Catalog-shaped recipes for Cookbook tests. Values are small invented numbers chosen to exercise
 * the planners, not real dishes.
 */
import { ALLERGEN_IDS, type AllergenMap, type RecipeCandidate } from '@/lib/catalog';

const allFree = Object.fromEntries(ALLERGEN_IDS.map((a) => [a, 'free'])) as AllergenMap;

/** Core ingredients default to the matched ids, as for a dish with no staples or optional lines. */
export function makeCandidate(
  id: string,
  overrides: Partial<RecipeCandidate> = {},
): RecipeCandidate {
  const ingredientIds = overrides.ingredientIds ?? [`${id}-a`, `${id}-b`];
  return {
    id,
    slug: id,
    title: `Dish ${id}`,
    summary: 'A test dish.',
    cuisine: 'italian',
    region: 'southern_europe',
    course: 'main',
    totalMinutes: 25,
    activeMinutes: 15,
    servings: 2,
    effort: 1,
    imageUrl: null,
    imageCredit: null,
    sourceName: 'Test',
    sourceUrl: null,
    license: 'test',
    nutritionConfidence: 'computed',
    nutrition: {
      kcal: 550,
      proteinG: 28,
      carbsG: 60,
      fatG: 18,
      satFatG: 4,
      fiberG: 9,
      sugarG: 6,
      addedSugarG: 2,
      sodiumMg: 600,
    },
    allergens: allFree,
    dietFlags: 0b111111111,
    goalTags: [],
    gentle: false,
    healthScore: 0.6,
    familyId: id,
    ingredientIds,
    coreIngredientIds: ingredientIds,
    ...overrides,
  };
}

const CUISINES = ['italian', 'mexican', 'indian', 'japanese', 'lebanese', 'thai', 'greek'];

/** A mixed pool: breakfasts, mains across cuisines and snacks. */
export function candidatePool(): RecipeCandidate[] {
  const out: RecipeCandidate[] = [];
  for (let i = 0; i < 10; i += 1) {
    out.push(
      makeCandidate(`b${i}`, {
        course: 'breakfast',
        cuisine: CUISINES[i % CUISINES.length]!,
        nutrition: {
          kcal: 350 + i * 10,
          proteinG: 15 + i,
          carbsG: 45,
          fatG: 10,
          satFatG: 2,
          fiberG: 6,
          sugarG: 8,
          addedSugarG: 3,
          sodiumMg: 300,
        },
      }),
    );
  }
  for (let i = 0; i < 24; i += 1) {
    out.push(
      makeCandidate(`m${i}`, {
        course: i % 5 === 0 ? 'soup' : 'main',
        cuisine: CUISINES[i % CUISINES.length]!,
        totalMinutes: 20 + (i % 4) * 10,
      }),
    );
  }
  for (let i = 0; i < 6; i += 1) {
    out.push(
      makeCandidate(`s${i}`, {
        course: 'snack',
        gentle: true,
        nutrition: {
          kcal: 180,
          proteinG: 7,
          carbsG: 20,
          fatG: 7,
          satFatG: 1,
          fiberG: 4,
          sugarG: 5,
          addedSugarG: 1,
          sodiumMg: 120,
        },
      }),
    );
  }
  return out;
}
