import { z } from 'zod';
import { ALLERGEN_IDS, INGREDIENT_CATEGORIES, type AllergenId, type IngredientCategory } from '../types.ts';

export const AISLES = [
  'produce',
  'meat_seafood',
  'dairy_eggs',
  'bakery',
  'grains_pasta',
  'canned_jarred',
  'baking',
  'spices',
  'condiments',
  'oils_vinegars',
  'international',
  'nuts_dried_fruit',
  'frozen',
  'beverages',
  'pantry',
] as const;
export type Aisle = (typeof AISLES)[number];

/** Land-animal content that diet rules care about. Fish/shellfish come from allergens. */
/** 'mixed' = unspecified meat ("ground meat"): fails every meat-related diet rule. */
export const MEAT_KINDS = ['beef', 'pork', 'poultry', 'lamb', 'game', 'gelatin', 'mixed'] as const;
export type MeatKind = (typeof MEAT_KINDS)[number];

const DEFAULT_AISLE: Record<IngredientCategory, Aisle> = {
  produce: 'produce',
  protein: 'meat_seafood',
  dairy: 'dairy_eggs',
  grain: 'grains_pasta',
  legume: 'canned_jarred',
  nut_seed: 'nuts_dried_fruit',
  spice: 'spices',
  condiment: 'condiments',
  oil: 'oils_vinegars',
  sweetener: 'baking',
  beverage: 'beverages',
  other: 'pantry',
};

export interface IngredientOptions {
  /** Display name when it differs from the id. */
  name?: string;
  plural?: string;
  /** Alternate spellings; matching also tries simple singular/plural forms automatically. */
  syn?: string[];
  aisle?: Aisle;
  /** USDA FDC food used for nutrition: [fdc_id, exact FDC description]. */
  fdc?: readonly [number, string] | null;
  allergens?: AllergenId[];
  /**
   * Composite or store-bought products whose recipe varies by brand (bread, stock cubes,
   * sausages). Listed allergens are certain; any other allergen is treated as unknown.
   */
  variable?: boolean;
  meat?: MeatKind;
  alcohol?: boolean;
  /** Animal-derived but neither meat, milk nor egg (honey, bone broth gelatin-free etc.). */
  animalProduct?: boolean;
  pantry?: boolean;
  /** Grams per unit; overrides FDC portions. Keys: Unit names plus small/medium/large/piece. */
  units?: Record<string, number>;
  /** Sugars in this ingredient count as added sugars (sweeteners, jams, sweetened products). */
  addedSugar?: boolean;
  /** Plain water or ice: excluded from portion estimates. */
  water?: boolean;
  /** Sold as a plant-based product (vegan spread, plant milk): vegan even though brands vary. */
  labelledVegan?: boolean;
}

export interface IngredientDef extends Required<Pick<IngredientOptions, 'syn' | 'allergens' | 'units'>> {
  id: string;
  name: string;
  plural: string | null;
  category: IngredientCategory;
  aisle: Aisle;
  fdc: readonly [number, string] | null;
  variable: boolean;
  meat: MeatKind | null;
  alcohol: boolean;
  animalProduct: boolean;
  pantry: boolean;
  addedSugar: boolean;
  water: boolean;
  labelledVegan: boolean;
}

export function ing(id: string, category: IngredientCategory, options: IngredientOptions = {}): IngredientDef {
  const name = options.name ?? id.replace(/_/g, ' ');
  return {
    id,
    name,
    plural: options.plural ?? null,
    category,
    aisle: options.aisle ?? DEFAULT_AISLE[category],
    syn: options.syn ?? [],
    fdc: options.fdc ?? null,
    allergens: options.allergens ?? [],
    variable: options.variable ?? false,
    meat: options.meat ?? null,
    alcohol: options.alcohol ?? false,
    animalProduct: options.animalProduct ?? false,
    pantry: options.pantry ?? false,
    units: options.units ?? {},
    addedSugar: options.addedSugar ?? category === 'sweetener',
    water: options.water ?? false,
    labelledVegan: options.labelledVegan ?? false,
  };
}

export const ingredientDefSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().min(1),
  plural: z.string().nullable(),
  category: z.enum(INGREDIENT_CATEGORIES),
  aisle: z.enum(AISLES),
  syn: z.array(z.string().min(1)),
  fdc: z.tuple([z.number().int().positive(), z.string().min(1)]).nullable(),
  allergens: z.array(z.enum(ALLERGEN_IDS)),
  variable: z.boolean(),
  meat: z.enum(MEAT_KINDS).nullable(),
  alcohol: z.boolean(),
  animalProduct: z.boolean(),
  pantry: z.boolean(),
  units: z.record(z.string(), z.number().positive()),
  addedSugar: z.boolean(),
  water: z.boolean(),
  labelledVegan: z.boolean(),
});
