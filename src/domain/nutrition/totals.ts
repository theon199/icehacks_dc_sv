/**
 * Adding up nutrition across a day and comparing it with daily targets.
 */
import {
  NUTRIENTS,
  TARGET_KIND,
  TARGET_NUTRIENTS,
  type DailyTargets,
  type NutrientKey,
  type NutritionFacts,
  type TargetNutrient,
} from './types';

export type NutrientTotals = { readonly [K in NutrientKey]: number };

export interface DayEntry {
  readonly nutrition: NutritionFacts | null | undefined;
  /** Servings eaten, as a multiple of one standard serving (a half portion is 0.5). */
  readonly portion?: number | undefined;
}

export interface DayTotals {
  readonly totals: NutrientTotals;
  /** Nutrients where at least one entry had no value, so the total is a lower bound. */
  readonly incomplete: readonly NutrientKey[];
  readonly entryCount: number;
}

export function emptyTotals(): { [K in NutrientKey]: number } {
  const out = {} as { [K in NutrientKey]: number };
  for (const key of NUTRIENTS) out[key] = 0;
  return out;
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Sum nutrition over entries, tracking which nutrients had gaps. */
export function sumNutrition(entries: readonly DayEntry[]): DayTotals {
  const totals = emptyTotals();
  const incomplete = new Set<NutrientKey>();
  for (const entry of entries) {
    const portion = finite(entry.portion) && entry.portion >= 0 ? entry.portion : 1;
    for (const key of NUTRIENTS) {
      const v = entry.nutrition?.[key];
      if (finite(v)) totals[key] += v * portion;
      else incomplete.add(key);
    }
  }
  return {
    totals,
    incomplete: NUTRIENTS.filter((k) => incomplete.has(k)),
    entryCount: entries.length,
  };
}

/**
 * Share of each daily target that one serving provides (0.25 = 25%). For `max` nutrients this is
 * the share of the limit used up. Missing values stay `null`.
 */
export function percentOfDailyValue(
  nutrition: NutritionFacts,
  targets: DailyTargets,
  portion = 1,
): { readonly [K in TargetNutrient]: number | null } {
  const out = {} as { [K in TargetNutrient]: number | null };
  for (const key of TARGET_NUTRIENTS) {
    const v = nutrition[key];
    const t = targets[key];
    out[key] = finite(v) && t > 0 ? (v * portion) / t : null;
  }
  return out;
}

export type TargetStatus = 'under' | 'on_target' | 'over' | 'met' | 'short' | 'within' | 'info';

/** How close energy must be to its target to count as on target. */
export const ENERGY_TOLERANCE = 0.1;

/**
 * Read a day's totals against targets: energy within ±10% is `on_target`; `min` nutrients are
 * `met` or `short`; `max` nutrients are `within` or `over`; reference nutrients are `info`.
 */
export function compareToTargets(
  totals: NutrientTotals,
  targets: DailyTargets,
): { readonly [K in TargetNutrient]: TargetStatus } {
  const out = {} as { [K in TargetNutrient]: TargetStatus };
  for (const key of TARGET_NUTRIENTS) {
    const v = totals[key];
    const t = targets[key];
    switch (TARGET_KIND[key]) {
      case 'energy':
        out[key] =
          v < t * (1 - ENERGY_TOLERANCE)
            ? 'under'
            : v > t * (1 + ENERGY_TOLERANCE)
              ? 'over'
              : 'on_target';
        break;
      case 'min':
        out[key] = v >= t ? 'met' : 'short';
        break;
      case 'max':
        out[key] = v <= t ? 'within' : 'over';
        break;
      default:
        out[key] = 'info';
    }
  }
  return out;
}
