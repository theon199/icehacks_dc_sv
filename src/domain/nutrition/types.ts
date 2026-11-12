/**
 * Nutrition types. Field names follow the per-serving nutrition columns of the `recipes` table in
 * docs/DATA.md so catalog rows can be passed in directly.
 */

export const NUTRIENTS = [
  'kcal',
  'protein_g',
  'carbs_g',
  'fat_g',
  'sat_fat_g',
  'fiber_g',
  'sugar_g',
  'added_sugar_g',
  'sodium_mg',
] as const;

export type NutrientKey = (typeof NUTRIENTS)[number];

/** Per-serving nutrition; any value may be missing. */
export type NutritionFacts = { readonly [K in NutrientKey]?: number | null | undefined };

/** Nutrients that have a daily target. Total sugars have none in the Dietary Guidelines. */
export const TARGET_NUTRIENTS = [
  'kcal',
  'protein_g',
  'carbs_g',
  'fat_g',
  'fiber_g',
  'sat_fat_g',
  'added_sugar_g',
  'sodium_mg',
] as const;

export type TargetNutrient = (typeof TARGET_NUTRIENTS)[number];

/**
 * How a target is read:
 * - `energy`: aim close to it, in either direction.
 * - `min`: reach at least this much (protein, fiber).
 * - `max`: stay at or under it (sodium, saturated fat, added sugar).
 * - `reference`: a typical share of energy, shown for context only (carbs, fat).
 */
export type TargetKind = 'energy' | 'min' | 'max' | 'reference';

export const TARGET_KIND: Readonly<Record<TargetNutrient, TargetKind>> = {
  kcal: 'energy',
  protein_g: 'min',
  fiber_g: 'min',
  carbs_g: 'reference',
  fat_g: 'reference',
  sat_fat_g: 'max',
  added_sugar_g: 'max',
  sodium_mg: 'max',
};

export type Sex = 'female' | 'male';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

/** Optional personal details from the profile. Anything absent falls back to a reference value. */
export interface PersonalDetails {
  readonly age?: number | null | undefined;
  readonly sex?: Sex | null | undefined;
  readonly heightCm?: number | null | undefined;
  readonly weightKg?: number | null | undefined;
  readonly activity?: ActivityLevel | null | undefined;
}

export type DailyTargets = { readonly [K in TargetNutrient]: number } & {
  /** `personal` when energy came from the person's own details, else `reference` (2,000 kcal). */
  readonly basis: 'personal' | 'reference';
};
