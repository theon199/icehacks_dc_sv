/**
 * A small hand-made catalog for Discover tests: enough cuisines, cooking times, allergens and
 * gentle dishes to exercise every mode. Test-only; never imported by app code.
 */
import {
  ALLERGEN_IDS,
  type AllergenId,
  type AllergenStatus,
  type RecipeCandidate,
} from '@/lib/catalog/types';

type Overrides = Partial<Omit<RecipeCandidate, 'allergens'>> & {
  allergens?: Partial<Record<AllergenId, AllergenStatus>>;
};

const REGION: Record<string, string> = {
  italian: 'southern_europe',
  mexican: 'latin_america',
  japanese: 'east_asia',
  indian: 'south_asia',
  american: 'north_america',
  ethiopian: 'sub_saharan_africa',
};

export function candidate(id: string, overrides: Overrides = {}): RecipeCandidate {
  const { allergens = {}, ...rest } = overrides;
  const cuisine = rest.cuisine ?? 'american';
  // Core ingredients default to the matched ids, as for a dish with no staples or optional lines.
  const ingredientIds = rest.ingredientIds ?? [`${id}-a`, `${id}-b`, `${id}-c`];
  const statuses = Object.fromEntries(
    ALLERGEN_IDS.map((allergen) => [allergen, allergens[allergen] ?? 'free']),
  ) as Record<AllergenId, AllergenStatus>;
  return {
    id,
    slug: id,
    title: `Dish ${id}`,
    summary: '',
    cuisine,
    region: REGION[cuisine] ?? 'global',
    course: 'main',
    totalMinutes: 40,
    activeMinutes: 20,
    servings: 2,
    effort: 1,
    imageUrl: `https://images.example.test/${id}.jpg`,
    imageCredit: null,
    sourceName: 'Test kitchen',
    sourceUrl: null,
    license: 'test',
    nutritionConfidence: 'computed',
    nutrition: {
      kcal: 480,
      proteinG: 24,
      carbsG: 50,
      fatG: 16,
      satFatG: 4,
      fiberG: 7,
      sugarG: 6,
      addedSugarG: 1,
      sodiumMg: 520,
    },
    dietFlags: 0,
    goalTags: [],
    gentle: false,
    healthScore: 0.6,
    familyId: id,
    ingredientIds,
    coreIngredientIds: [...new Set(ingredientIds)],
    ...rest,
    allergens: statuses,
  };
}

const cuisines = ['italian', 'mexican', 'japanese', 'indian', 'american', 'ethiopian'] as const;

/** 30 dishes across six cuisines; every third is quick, every fifth gentle. */
export const FIXTURE_CATALOG: RecipeCandidate[] = Array.from({ length: 30 }, (_, i) =>
  candidate(`dish-${String(i).padStart(2, '0')}`, {
    title: `${cuisines[i % cuisines.length]} dish ${i}`,
    cuisine: cuisines[i % cuisines.length]!,
    totalMinutes: i % 3 === 0 ? 20 : 45,
    gentle: i % 5 === 0,
    healthScore: 0.4 + (i % 7) * 0.05,
    goalTags: i % 4 === 0 ? ['high_protein'] : [],
  }),
);

/** Dishes that must never reach someone avoiding peanuts. */
export const PEANUT_DISH = candidate('peanut-noodles', {
  title: 'Peanut noodles',
  cuisine: 'japanese',
  allergens: { peanut: 'contains' },
});
export const UNVERIFIED_PEANUT_DISH = candidate('mystery-satay', {
  title: 'Mystery satay',
  cuisine: 'indian',
  allergens: { peanut: 'unknown' },
});
