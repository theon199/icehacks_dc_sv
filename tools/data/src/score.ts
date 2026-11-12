/**
 * Famara health score: a deterministic 0..1 nutrient-density score per recipe.
 *
 * Rewards (each scaled to 0..1, then averaged into P):
 *   fiber    = min(1, fiber g per 100 kcal / 1.4)      (1.4 g/100 kcal = 14 g per 1,000 kcal, DGA)
 *   protein  = min(1, protein g per 100 kcal / 5)      (5 g/100 kcal = 20% of energy)
 *   plants   = min(1, plant share of food weight / 0.5) (produce + legumes)
 *
 * Penalties (each scaled to 0..1, then averaged into N):
 *   sodium   = clamp((sodium mg per 100 kcal - 50) / 200)   (full penalty at 250 mg/100 kcal)
 *   sat fat  = clamp((sat-fat share of energy - 0.07) / 0.13) (full penalty at 20% of energy)
 *   sugar    = clamp((added-sugar share of energy - 0.05) / 0.20) (full penalty at 25%)
 *
 * score = clamp(0.5 + 0.5 * P - 0.5 * N), rounded to 3 decimals.
 * Without usable nutrition the score is 0.3 + 0.4 * plants (a neutral-to-low default).
 * Same inputs always give the same score.
 */

export interface ScoreInputs {
  kcal: number | null;
  protein_g: number | null;
  fiber_g: number | null;
  sodium_mg: number | null;
  sat_fat_g: number | null;
  added_sugar_g: number | null;
  /** Share of food weight (water excluded) from produce and legumes, 0..1, or null if unknown. */
  vegetableShare: number | null;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const round3 = (value: number) => Math.round(value * 1000) / 1000;

export function healthScore(input: ScoreInputs): number {
  const plants = clamp01((input.vegetableShare ?? 0) / 0.5);
  if (input.kcal === null || input.kcal <= 0) return round3(0.3 + 0.4 * plants);
  const per100 = 100 / input.kcal;
  const fiber = clamp01(((input.fiber_g ?? 0) * per100) / 1.4);
  const protein = clamp01(((input.protein_g ?? 0) * per100) / 5);
  const sodium = clamp01(((input.sodium_mg ?? 0) * per100 - 50) / 200);
  const satFat = clamp01((((input.sat_fat_g ?? 0) * 9) / input.kcal - 0.07) / 0.13);
  const sugar = clamp01((((input.added_sugar_g ?? 0) * 4) / input.kcal - 0.05) / 0.2);
  const positives = (fiber + protein + plants) / 3;
  const negatives = (sodium + satFat + sugar) / 3;
  return round3(clamp01(0.5 + 0.5 * positives - 0.5 * negatives));
}
