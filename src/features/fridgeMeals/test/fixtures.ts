/** Builders for catalog-shaped test data. Only imported by tests. */
import { allergenMapFrom } from '@/domain';
import {
  type AllergenId,
  type AllergenStatus,
  type Ingredient,
  type RecipeCandidate,
} from '@/lib/catalog';

export function candidate(
  id: string,
  overrides: Partial<Omit<RecipeCandidate, 'allergens'>> & {
    allergens?: Partial<Record<AllergenId, AllergenStatus>>;
  } = {},
): RecipeCandidate {
  const { allergens, ...rest } = overrides;
  const core = rest.coreIngredientIds ?? [];
  return {
    id,
    slug: id.replace(/[^a-z0-9]+/gi, '-'),
    title: `Recipe ${id}`,
    summary: '',
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
    license: 'test',
    nutritionConfidence: 'computed',
    nutrition: {
      kcal: 480,
      proteinG: 23,
      carbsG: 40,
      fatG: 18,
      satFatG: 6,
      fiberG: 7,
      sugarG: 6,
      addedSugarG: 0,
      sodiumMg: 500,
    },
    dietFlags: 0,
    goalTags: [],
    gentle: false,
    healthScore: 0.6,
    familyId: id,
    ingredientIds: core,
    coreIngredientIds: core,
    ...rest,
    allergens: allergenMapFrom((allergen) => allergens?.[allergen] ?? 'free'),
  };
}

export function ingredient(id: string, name: string, plural: string | null = null): Ingredient {
  return {
    id,
    name,
    plural,
    category: 'other',
    aisle: null,
    fdcId: null,
    allergens: [],
    allergenStatus: 'resolved',
    dietFlags: 0,
    pantryStaple: false,
    gramsPerUnit: {},
  };
}
