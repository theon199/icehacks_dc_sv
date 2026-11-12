/**
 * The recipe screen's nutrition panel: one serving (a half portion in small appetite mode), each
 * nutrient with its share of the person's daily target, and a plain label saying how the numbers
 * were produced.
 */
import {
  percentOfDailyValue,
  TARGET_KIND,
  type DailyTargets,
  type NutrientKey,
  type NutritionFacts,
  type TargetKind,
} from '@/domain/nutrition';
import type { NutritionConfidence, RecipeNutrition } from '@/lib/catalog';
import { formatGrams, formatKcal, formatMilligrams } from '@/lib/format';

/** Catalog field names → the nutrient keys the domain uses. */
export function toNutritionFacts(n: RecipeNutrition): NutritionFacts {
  return {
    kcal: n.kcal,
    protein_g: n.proteinG,
    carbs_g: n.carbsG,
    fat_g: n.fatG,
    sat_fat_g: n.satFatG,
    fiber_g: n.fiberG,
    sugar_g: n.sugarG,
    added_sugar_g: n.addedSugarG,
    sodium_mg: n.sodiumMg,
  };
}

interface NutrientDef {
  readonly key: NutrientKey;
  readonly label: string;
  /** Indented under the line above (saturated fat under fat). */
  readonly sub?: true;
}

export const PANEL_NUTRIENTS: readonly NutrientDef[] = [
  { key: 'kcal', label: 'Energy' },
  { key: 'protein_g', label: 'Protein' },
  { key: 'carbs_g', label: 'Carbohydrate' },
  { key: 'fiber_g', label: 'Fiber', sub: true },
  { key: 'sugar_g', label: 'Sugars', sub: true },
  { key: 'added_sugar_g', label: 'Added sugars', sub: true },
  { key: 'fat_g', label: 'Fat' },
  { key: 'sat_fat_g', label: 'Saturated fat', sub: true },
  { key: 'sodium_mg', label: 'Sodium' },
];

export function formatNutrient(key: NutrientKey, value: number | null | undefined): string {
  if (key === 'kcal') return formatKcal(value);
  if (key === 'sodium_mg') return formatMilligrams(value);
  return formatGrams(value);
}

export interface NutritionRow {
  readonly key: NutrientKey;
  readonly label: string;
  readonly sub: boolean;
  /** Formatted amount per serving, "—" when unknown. */
  readonly value: string;
  /** Share of the daily target (0.25 = 25%); null when there is no target or no value. */
  readonly dailyShare: number | null;
  /** How the share reads: `max` nutrients are limits, `min` are goals to reach. */
  readonly kind: TargetKind | null;
}

/** Rows for the panel, scaled to the portion each serving represents. */
export function nutritionRows(
  nutrition: RecipeNutrition,
  targets: DailyTargets,
  portion: number,
): NutritionRow[] {
  const facts = toNutritionFacts(nutrition);
  const shares = percentOfDailyValue(facts, targets, portion);
  return PANEL_NUTRIENTS.map(({ key, label, sub }) => {
    const raw = facts[key];
    const value = typeof raw === 'number' && Number.isFinite(raw) ? raw * portion : null;
    const kind = key in TARGET_KIND ? TARGET_KIND[key as keyof typeof TARGET_KIND] : null;
    const share = kind ? shares[key as keyof typeof shares] : null;
    return {
      key,
      label,
      sub: !!sub,
      value: formatNutrient(key, value),
      dailyShare: share ?? null,
      kind,
    };
  });
}

export interface ConfidenceLabel {
  readonly title: string;
  readonly detail: string;
}

export function confidenceLabel(confidence: NutritionConfidence): ConfidenceLabel {
  switch (confidence) {
    case 'computed':
      return {
        title: 'Calculated',
        detail: 'Worked out from USDA nutrient data for every ingredient.',
      };
    case 'estimated':
      return {
        title: 'Estimated',
        detail: 'Some ingredients had no exact USDA match, so parts of this are approximate.',
      };
    case 'none':
      return {
        title: 'Not available',
        detail: "We don't have reliable nutrition data for this recipe yet.",
      };
  }
}

/** "Based on your details" or the reference diet used on U.S. labels. */
export function targetBasisLabel(targets: Pick<DailyTargets, 'basis' | 'kcal'>): string {
  return targets.basis === 'personal'
    ? `% of your daily targets (${Math.round(targets.kcal)} kcal)`
    : '% of daily value, based on a 2,000 kcal reference diet';
}
