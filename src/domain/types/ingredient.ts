/** Catalog ingredients (docs/DATA.md `ingredients` table), parsed into app shape. */
import { z } from 'zod';

import { allergenIdSchema, type AllergenId } from './allergens';
import { jsonText } from './json';

export const INGREDIENT_CATEGORIES = [
  'produce',
  'protein',
  'dairy',
  'grain',
  'legume',
  'nut_seed',
  'spice',
  'condiment',
  'oil',
  'sweetener',
  'beverage',
  'other',
] as const;

export type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];

export const ingredientCategorySchema = z.enum(INGREDIENT_CATEGORIES);

/** Slug such as `chickpea`. */
export type IngredientId = string;

export const ingredientIdSchema = z.string().min(1).max(80);

export interface Ingredient {
  readonly id: IngredientId;
  readonly name: string;
  readonly plural: string | null;
  readonly category: IngredientCategory;
  readonly aisle: string | null;
  readonly fdcId: number | null;
  /** Allergens it is known to contain. Only meaningful when `allergenStatus` is `resolved`. */
  readonly allergens: readonly AllergenId[];
  /** `unknown` for composite store-bought items whose contents vary by brand. */
  readonly allergenStatus: 'resolved' | 'unknown';
  readonly dietFlags: number;
  /** Common staples (salt, oil, water) that never count toward pantry matching. */
  readonly pantryStaple: boolean;
  readonly gramsPerUnit: Readonly<Record<string, number>>;
}

/** Raw `ingredients` row → `Ingredient`. */
export const ingredientRowSchema = z
  .object({
    id: ingredientIdSchema,
    name: z.string().min(1),
    plural: z.string().nullable(),
    category: ingredientCategorySchema,
    aisle: z.string().nullable(),
    fdc_id: z.number().int().nullable(),
    // Unrecognised allergen names cannot be dropped silently here; they make the row invalid.
    allergens: jsonText(z.array(allergenIdSchema)),
    allergen_status: z.enum(['resolved', 'unknown']),
    diet_flags: z.number().int().nonnegative(),
    pantry_staple: z.number().int(),
    grams_per_unit: jsonText(z.record(z.string(), z.number().positive())).nullable(),
  })
  .transform((row): Ingredient => ({
    id: row.id,
    name: row.name,
    plural: row.plural,
    category: row.category,
    aisle: row.aisle,
    fdcId: row.fdc_id,
    allergens: row.allergens,
    allergenStatus: row.allergen_status,
    dietFlags: row.diet_flags,
    pantryStaple: row.pantry_staple !== 0,
    gramsPerUnit: row.grams_per_unit ?? {},
  }));
