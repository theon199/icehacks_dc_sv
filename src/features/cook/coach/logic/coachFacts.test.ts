import { DietFlag, type Ingredient, type RecipeDetail } from '@/lib/catalog';

import { coachFacts } from './coachFacts';

const MEAT_FLAGS = DietFlag.no_alcohol;
const PLANT_FLAGS = DietFlag.vegetarian | DietFlag.vegan | DietFlag.no_alcohol;

function ingredient(id: string, overrides: Partial<Ingredient> = {}): Ingredient {
  return {
    id,
    name: id.replace(/_/g, ' '),
    plural: null,
    category: 'protein',
    aisle: null,
    fdcId: null,
    allergens: [],
    allergenStatus: 'resolved',
    dietFlags: MEAT_FLAGS,
    pantryStaple: false,
    gramsPerUnit: {},
    ...overrides,
  };
}

const CATALOG: readonly Ingredient[] = [
  ingredient('chicken_thigh'),
  ingredient('ground_turkey'),
  ingredient('pork_sausage'),
  ingredient('sausage'),
  ingredient('ground_beef'),
  ingredient('beef_steak'),
  ingredient('lamb_chop'),
  ingredient('cooked_meat'),
  ingredient('haddock', { allergens: ['fish'], dietFlags: MEAT_FLAGS | DietFlag.pescatarian }),
  ingredient('shrimp', { allergens: ['shellfish'], dietFlags: DietFlag.pescatarian }),
  ingredient('egg', { allergens: ['egg'], dietFlags: DietFlag.vegetarian }),
  ingredient('custard', { category: 'dairy', allergens: ['milk', 'egg'], dietFlags: 1 }),
  ingredient('mayonnaise', { category: 'condiment', allergens: ['egg'], dietFlags: 1 }),
  ingredient('fish_sauce', { category: 'condiment', allergens: ['fish'], dietFlags: 4 }),
  ingredient('chicken_stock', { category: 'other' }),
  ingredient('tofu', { allergens: ['soy'], dietFlags: PLANT_FLAGS }),
  ingredient('onion', { category: 'produce', dietFlags: PLANT_FLAGS }),
];
const BY_ID: ReadonlyMap<string, Ingredient> = new Map(CATALOG.map((item) => [item.id, item]));

const FREE = {
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
} as const;

function recipe(ingredientIds: (string | null)[], allergens = {}): RecipeDetail {
  return {
    id: 'r1',
    title: 'Test',
    allergens: { ...FREE, ...allergens },
    ingredients: ingredientIds.map((ingredientId, position) => ({
      position,
      ingredientId,
      text: ingredientId ?? 'a pinch of something',
      quantity: null,
      unit: null,
      grams: null,
      section: null,
      optional: false,
    })),
    steps: [],
  } as unknown as RecipeDetail;
}

const safetyOf = (ids: (string | null)[]) => coachFacts(recipe(ids), BY_ID).safety;

describe('coachFacts', () => {
  it('names the kinds of meat, fish and egg among the ingredients', () => {
    expect(safetyOf(['chicken_thigh', 'onion'])).toEqual(['poultry']);
    expect(safetyOf(['ground_turkey'])).toEqual(['poultry', 'minced_meat']);
    expect(safetyOf(['pork_sausage'])).toEqual(['minced_meat']);
    expect(safetyOf(['ground_beef', 'beef_steak', 'lamb_chop'])).toEqual([
      'minced_meat',
      'whole_meat',
    ]);
    expect(safetyOf(['haddock'])).toEqual(['fish']);
    expect(safetyOf(['shrimp'])).toEqual(['shellfish']);
    expect(safetyOf(['egg', 'onion'])).toEqual(['egg']);
    expect(safetyOf(['custard'])).toEqual(['egg']);
  });

  it('leaves out sauces, stocks and plant proteins that need no thermometer', () => {
    expect(safetyOf(['mayonnaise', 'fish_sauce', 'chicken_stock', 'tofu', 'onion'])).toEqual([]);
  });

  it('counts meat it cannot place, unmatched lines and missing ingredients as unknown', () => {
    expect(safetyOf(['sausage'])).toEqual(['minced_meat', 'unknown']);
    expect(safetyOf(['cooked_meat'])).toEqual(['unknown']);
    expect(safetyOf(['onion', null])).toEqual(['unknown']);
    expect(safetyOf(['not_in_the_catalog'])).toEqual(['unknown']);
    expect(coachFacts(recipe(['onion']), null).safety).toEqual(['unknown']);
  });

  it('lists only the allergens the catalog says the recipe contains', () => {
    const facts = coachFacts(
      recipe(['onion'], { milk: 'contains', peanut: 'unknown', sesame: 'contains' }),
      BY_ID,
    );
    expect(facts.allergens).toEqual(['milk', 'sesame']);
  });
});
