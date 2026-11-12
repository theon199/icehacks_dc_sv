import type { FdcFood } from '../sources/fdc.ts';
import type { Nutrition } from '../types.ts';

/** Nutrients per 100 g of an ingredient. Missing FDC values count as zero (documented). */
export interface NutrientProfile {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sat_fat_g: number;
  fiber_g: number;
  sugar_g: number;
  added_sugar_g: number;
  sodium_mg: number;
}

/** FDC nutrient ids, in order of preference when a dataset reports alternatives. */
const NUTRIENT_IDS = {
  kcal: [1008, 2048, 2047],
  protein_g: [1003],
  fat_g: [1004, 1085],
  carbs_g: [1005, 1050],
  fiber_g: [1079],
  sugar_g: [2000, 1063],
  sat_fat_g: [1258],
  sodium_mg: [1093],
} as const;

function pick(food: FdcFood, ids: readonly number[]): number | undefined {
  for (const id of ids) {
    const value = food.nutrients.get(id);
    if (value !== undefined) return value;
  }
  return undefined;
}

export function nutrientProfile(food: FdcFood, addedSugar: boolean): NutrientProfile {
  const protein = pick(food, NUTRIENT_IDS.protein_g) ?? 0;
  const fat = pick(food, NUTRIENT_IDS.fat_g) ?? 0;
  const carbs = pick(food, NUTRIENT_IDS.carbs_g) ?? 0;
  const sugar = pick(food, NUTRIENT_IDS.sugar_g) ?? 0;
  // Atwater general factors when a food reports no energy value.
  const kcal = pick(food, NUTRIENT_IDS.kcal) ?? protein * 4 + carbs * 4 + fat * 9;
  return {
    kcal,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    sat_fat_g: pick(food, NUTRIENT_IDS.sat_fat_g) ?? 0,
    fiber_g: pick(food, NUTRIENT_IDS.fiber_g) ?? 0,
    sugar_g: sugar,
    added_sugar_g: addedSugar ? sugar : 0,
    sodium_mg: pick(food, NUTRIENT_IDS.sodium_mg) ?? 0,
  };
}

export const ZERO_PROFILE: NutrientProfile = {
  kcal: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  sat_fat_g: 0,
  fiber_g: 0,
  sugar_g: 0,
  added_sugar_g: 0,
  sodium_mg: 0,
};

const KEYS = Object.keys(ZERO_PROFILE) as Array<keyof NutrientProfile>;

export function addScaled(total: NutrientProfile, per100g: NutrientProfile, grams: number): NutrientProfile {
  const out = { ...total };
  for (const key of KEYS) out[key] += (per100g[key] * grams) / 100;
  return out;
}

export function divide(total: NutrientProfile, by: number): NutrientProfile {
  const out = { ...total };
  for (const key of KEYS) out[key] = total[key] / by;
  return out;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export function toNutrition(profile: NutrientProfile): Nutrition {
  return {
    kcal: Math.round(profile.kcal),
    protein_g: round1(profile.protein_g),
    carbs_g: round1(profile.carbs_g),
    fat_g: round1(profile.fat_g),
    sat_fat_g: round1(profile.sat_fat_g),
    fiber_g: round1(profile.fiber_g),
    sugar_g: round1(profile.sugar_g),
    added_sugar_g: round1(profile.added_sugar_g),
    sodium_mg: Math.round(profile.sodium_mg),
  };
}

export const EMPTY_NUTRITION: Nutrition = {
  kcal: null,
  protein_g: null,
  carbs_g: null,
  fat_g: null,
  sat_fat_g: null,
  fiber_g: null,
  sugar_g: null,
  added_sugar_g: null,
  sodium_mg: null,
};
