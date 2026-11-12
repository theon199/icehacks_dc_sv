/**
 * Daily nutrient targets.
 *
 * Energy uses the Mifflin-St Jeor resting-energy equation times an activity factor. The other
 * targets follow the Dietary Guidelines for Americans and the DRI tables:
 * - protein: the RDA of 0.8 g per kg body weight, and never below 10% of energy;
 * - fiber: 14 g per 1,000 kcal;
 * - sodium: at most 2,300 mg (2,200 mg under age 14);
 * - saturated fat and added sugars: each under 10% of energy;
 * - carbohydrate (50% of energy) and fat (30%) as mid-range reference shares.
 *
 * Without enough personal detail for an energy estimate, the 2,000 kcal reference diet used on
 * U.S. nutrition labels applies. Targets are informational, not medical advice.
 */
import type { ActivityLevel, DailyTargets, PersonalDetails } from './types';

export const REFERENCE_KCAL = 2000;
export const REFERENCE_PROTEIN_G = 50;

/** Physical-activity multipliers applied to resting energy. */
export const ACTIVITY_FACTOR: Readonly<Record<ActivityLevel, number>> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Activity assumed when the person has not said: most adults are lightly active. */
export const DEFAULT_ACTIVITY: ActivityLevel = 'light';

const MIN_KCAL = 1200;
const MAX_KCAL = 4000;

export interface TargetOptions {
  /** Goal tags from preferences; `high_protein` and `lower_sodium` adjust targets. */
  readonly goals?: readonly string[] | undefined;
}

function valid(n: number | null | undefined, lo: number, hi: number): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
}

/**
 * Age reached during the year of `now`. Only the birth year is collected, so this can be one
 * higher than the true age for part of the year; that is well within the equation's precision.
 */
export function ageFromBirthYear(birthYear: number, now: Date): number | null {
  if (!Number.isInteger(birthYear)) return null;
  const age = now.getFullYear() - birthYear;
  return age >= 0 && age < 130 ? age : null;
}

/**
 * Mifflin-St Jeor resting energy (kcal/day). When sex is not given, the midpoint of the male (+5)
 * and female (−161) constants is used. Returns `null` when a required detail is missing.
 */
export function restingEnergy(details: PersonalDetails): number | null {
  const { weightKg, heightCm, age, sex } = details;
  if (!valid(weightKg, 25, 350) || !valid(heightCm, 100, 250) || !valid(age, 13, 120)) return null;
  const constant = sex === 'male' ? 5 : sex === 'female' ? -161 : -78;
  return 10 * weightKg + 6.25 * heightCm - 5 * age + constant;
}

/** Estimated daily energy need, clamped to a safe range, rounded to 10 kcal. */
export function energyTarget(details: PersonalDetails): { kcal: number; personal: boolean } {
  const rest = restingEnergy(details);
  if (rest === null) return { kcal: REFERENCE_KCAL, personal: false };
  const factor = ACTIVITY_FACTOR[details.activity ?? DEFAULT_ACTIVITY];
  const kcal = Math.min(MAX_KCAL, Math.max(MIN_KCAL, rest * factor));
  return { kcal: Math.round(kcal / 10) * 10, personal: true };
}

export function dailyTargets(
  details: PersonalDetails = {},
  options: TargetOptions = {},
): DailyTargets {
  const goals = new Set(options.goals ?? []);
  const { kcal, personal } = energyTarget(details);
  const weight = valid(details.weightKg, 25, 350) ? details.weightKg : null;

  const proteinPerKg = goals.has('high_protein') ? 1.2 : 0.8;
  const proteinShare = goals.has('high_protein') ? 0.2 : 0.1;
  const proteinFloor = (kcal * proteinShare) / 4;
  const protein_g =
    weight === null
      ? Math.max(goals.has('high_protein') ? 75 : REFERENCE_PROTEIN_G, proteinFloor)
      : Math.max(weight * proteinPerKg, proteinFloor);

  const young = valid(details.age, 0, 13);
  const sodiumLimit = goals.has('lower_sodium') ? 1500 : young ? 2200 : 2300;

  return {
    kcal,
    protein_g: Math.round(protein_g),
    carbs_g: Math.round((kcal * 0.5) / 4),
    fat_g: Math.round((kcal * 0.3) / 9),
    fiber_g: Math.round((kcal / 1000) * 14),
    sat_fat_g: Math.round((kcal * 0.1) / 9),
    added_sugar_g: Math.round((kcal * 0.1) / 4),
    sodium_mg: sodiumLimit,
    basis: personal ? 'personal' : 'reference',
  };
}
