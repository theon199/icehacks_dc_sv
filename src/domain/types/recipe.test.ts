import { ingredientRowSchema } from './ingredient';
import {
  recipeIngredientRowSchema,
  recipeRowSchema,
  recipeStepRowSchema,
  recipeTutorialRowSchema,
  type RecipeRow,
} from './recipe';

const row: RecipeRow = {
  id: 'mealdb:1',
  slug: 'lentil-soup',
  title: 'Red lentil soup',
  summary: 'A quick, fiber-rich soup.',
  cuisine: 'turkish',
  region: 'middle_east',
  course: 'soup',
  total_minutes: 35,
  active_minutes: 15,
  servings: 4,
  effort: 1,
  image_url: 'https://example.org/soup.jpg',
  image_credit: null,
  source_name: 'Example',
  source_url: null,
  license: 'public-domain',
  kcal: 310,
  protein_g: 17,
  carbs_g: 45,
  fat_g: 7,
  sat_fat_g: 1,
  fiber_g: 11,
  sugar_g: 5,
  added_sugar_g: 0,
  sodium_mg: 420,
  nutrition_confidence: 'computed',
  allergens: '{"milk":"free","peanut":"free"}',
  diet_flags: 3,
  goal_tags: '["high_fiber","plant_forward"]',
  gentle: 1,
  health_score: 0.82,
  family_id: 'lentil-soup',
  core_ingredient_ids: 'red_lentil,onion,carrot,onion',
};

describe('recipe row parsing', () => {
  it('maps catalog columns to the app shape', () => {
    const recipe = recipeRowSchema.parse(row);
    expect(recipe).toMatchObject({
      id: 'mealdb:1',
      totalMinutes: 35,
      effort: 1,
      gentle: true,
      dietFlags: 3,
      goalTags: ['high_fiber', 'plant_forward'],
      nutrition: { proteinG: 17, sodiumMg: 420 },
      coreIngredientIds: ['red_lentil', 'onion', 'carrot'],
    });
    expect(recipe.allergens.milk).toBe('free');
    expect(recipe.allergens.egg).toBe('unknown');
  });

  it('accepts rows without core ingredient ids', () => {
    const { core_ingredient_ids: _omit, ...rest } = row;
    expect(recipeRowSchema.parse(rest).coreIngredientIds).toEqual([]);
    expect(recipeRowSchema.parse({ ...row, core_ingredient_ids: null }).coreIngredientIds).toEqual(
      [],
    );
  });

  it('rejects rows that break the contract', () => {
    expect(recipeRowSchema.safeParse({ ...row, effort: 4 }).success).toBe(false);
    expect(recipeRowSchema.safeParse({ ...row, region: 'atlantis' }).success).toBe(false);
    expect(recipeRowSchema.safeParse({ ...row, allergens: 'nope' }).success).toBe(false);
    expect(recipeRowSchema.safeParse({ ...row, health_score: 1.5 }).success).toBe(false);
  });

  it('parses ingredient lines, steps and tutorials', () => {
    expect(
      recipeIngredientRowSchema.parse({
        position: 0,
        ingredient_id: null,
        text: '1 stock cube',
        quantity: 1,
        unit: null,
        grams: null,
        section: null,
        optional: 0,
      }),
    ).toMatchObject({ ingredientId: null, optional: false });
    expect(recipeStepRowSchema.parse({ position: 1, text: 'Simmer', timer_seconds: 1200 })).toEqual(
      { position: 1, text: 'Simmer', timerSeconds: 1200 },
    );
    const badTutorial = { kind: 'video', url: 'not a url', title: null, publisher: null };
    expect(recipeTutorialRowSchema.safeParse(badTutorial).success).toBe(false);
  });
});

describe('ingredient row parsing', () => {
  const base = {
    id: 'stock_cube',
    name: 'stock cube',
    plural: 'stock cubes',
    category: 'condiment',
    aisle: 'Soups',
    fdc_id: null,
    allergens: '[]',
    allergen_status: 'unknown',
    diet_flags: 0,
    pantry_staple: 0,
    grams_per_unit: '{"cube":10}',
  };

  it('maps flags and JSON columns', () => {
    expect(ingredientRowSchema.parse(base)).toMatchObject({
      allergenStatus: 'unknown',
      pantryStaple: false,
      gramsPerUnit: { cube: 10 },
    });
    expect(ingredientRowSchema.parse({ ...base, grams_per_unit: null }).gramsPerUnit).toEqual({});
  });

  it('rejects unknown allergen names on ingredients', () => {
    expect(ingredientRowSchema.safeParse({ ...base, allergens: '["mustard"]' }).success).toBe(
      false,
    );
  });
});
