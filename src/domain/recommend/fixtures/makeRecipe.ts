/**
 * Test helpers for building recipes. Only imported by tests; never re-exported from a barrel.
 */
import { allergenMapFrom, type AllergenId, type AllergenStatus } from '../../types/allergens';
import { cuisineRegion } from '../../types/cuisines';
import { type RecipeSummary } from '../../types/recipe';

export type RecipeOverrides = Partial<Omit<RecipeSummary, 'allergens'>> & {
  /** Statuses to set; every other allergen is `free` unless `allergensDefault` says otherwise. */
  readonly allergens?: Partial<Record<AllergenId, AllergenStatus>>;
  readonly allergensDefault?: AllergenStatus;
};

let counter = 0;

export function makeRecipe(overrides: RecipeOverrides = {}): RecipeSummary {
  counter += 1;
  const { allergens = {}, allergensDefault = 'free', ...rest } = overrides;
  const id = rest.id ?? `test:${counter}`;
  const cuisine = rest.cuisine ?? 'american';
  const fullAllergens = allergenMapFrom((allergen) => allergens[allergen] ?? allergensDefault);

  return {
    slug: id.replace(/[^a-z0-9]+/gi, '-'),
    title: `Recipe ${id}`,
    summary: '',
    region: cuisineRegion(cuisine) ?? 'global',
    course: 'main',
    totalMinutes: 30,
    activeMinutes: 15,
    servings: 4,
    effort: 1,
    imageUrl: null,
    imageCredit: null,
    sourceName: 'Test kitchen',
    sourceUrl: null,
    license: 'test',
    nutrition: {
      kcal: 450,
      proteinG: 20,
      carbsG: 50,
      fatG: 15,
      satFatG: 4,
      fiberG: 6,
      sugarG: 8,
      addedSugarG: 2,
      sodiumMg: 600,
    },
    nutritionConfidence: 'computed',
    dietFlags: 0,
    goalTags: [],
    gentle: false,
    healthScore: 0.5,
    familyId: id,
    coreIngredientIds: [],
    ...rest,
    id,
    cuisine,
    allergens: fullAllergens,
  };
}
