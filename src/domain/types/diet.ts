/**
 * Dietary patterns as a bitmask (docs/DATA.md). A recipe's mask lists the diets it satisfies; a
 * person's mask lists the diets they follow. The recipe fits when it satisfies every one of them.
 */
import { z } from 'zod';

export const DietFlag = {
  vegetarian: 1,
  vegan: 2,
  pescatarian: 4,
  no_pork: 8,
  no_alcohol: 16,
  no_beef: 32,
  gluten_free: 64,
  dairy_free: 128,
  halal_friendly: 256,
} as const;

export type DietFlagName = keyof typeof DietFlag;

export const DIET_FLAG_NAMES = Object.keys(DietFlag) as DietFlagName[];

export const dietFlagNameSchema = z.enum(DIET_FLAG_NAMES as [DietFlagName, ...DietFlagName[]]);

/** Every defined bit. */
export const ALL_DIET_BITS = DIET_FLAG_NAMES.reduce((mask, name) => mask | DietFlag[name], 0);

export const DIET_LABELS: Readonly<Record<DietFlagName, string>> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  pescatarian: 'Pescatarian',
  no_pork: 'No pork',
  no_alcohol: 'No alcohol',
  no_beef: 'No beef',
  gluten_free: 'Gluten-free',
  dairy_free: 'Dairy-free',
  halal_friendly: 'Halal-friendly',
};

/** Short adjective used in explanations: "Not vegetarian", "Not gluten-free". */
export const DIET_ADJECTIVES: Readonly<Record<DietFlagName, string>> = {
  vegetarian: 'vegetarian',
  vegan: 'vegan',
  pescatarian: 'pescatarian',
  no_pork: 'pork-free',
  no_alcohol: 'alcohol-free',
  no_beef: 'beef-free',
  gluten_free: 'gluten-free',
  dairy_free: 'dairy-free',
  halal_friendly: 'halal-friendly',
};

export function dietMask(names: Iterable<DietFlagName>): number {
  let mask = 0;
  for (const name of names) mask |= DietFlag[name];
  return mask;
}

export function dietNames(mask: number): DietFlagName[] {
  return DIET_FLAG_NAMES.filter((name) => (mask & DietFlag[name]) !== 0);
}

export function hasDiet(mask: number, name: DietFlagName): boolean {
  return (mask & DietFlag[name]) !== 0;
}

/**
 * Adds the diets a recipe satisfies by implication: a vegan dish is vegetarian, and a vegetarian
 * dish suits pescatarians and contains no pork or beef. Allergen-like diets (gluten-free,
 * dairy-free) are never implied because they depend on verified ingredient data.
 */
export function withImpliedDiets(mask: number): number {
  let out = mask & ALL_DIET_BITS;
  if (out & DietFlag.vegan) out |= DietFlag.vegetarian;
  if (out & DietFlag.vegetarian) {
    out |= DietFlag.pescatarian | DietFlag.no_pork | DietFlag.no_beef;
  }
  return out;
}

/** Bits of `required` that the recipe does not satisfy (0 when it fits). */
export function missingDiets(recipeMask: number, required: number): number {
  return required & ~withImpliedDiets(recipeMask);
}

export function satisfiesDiet(recipeMask: number, required: number): boolean {
  return missingDiets(recipeMask, required) === 0;
}
