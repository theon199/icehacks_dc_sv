/**
 * Presentation and hand-off of a two-day nutrition plan: per-nutrient rows against the day's
 * targets, and the slot writes that copy the plan into the weekly planner.
 */
import {
  TARGET_KIND,
  type DailyTargets,
  type TargetNutrient,
  type TargetStatus,
} from '@/domain/nutrition';
import { addDays, type IsoDate, type PlanDaysResult, type PlannedDay } from '@/domain/plan';
import { slotKey } from '@/stores';

import { locateDate, storedPortion, type SlotWrite } from './week';

/** Nutrients shown under each planned day, in reading order. */
export const SHOWN_NUTRIENTS: readonly TargetNutrient[] = [
  'kcal',
  'protein_g',
  'fiber_g',
  'sodium_mg',
  'sat_fat_g',
  'added_sugar_g',
];

const NUTRIENT_NAMES: Readonly<Record<TargetNutrient, { label: string; unit: string }>> = {
  kcal: { label: 'Energy', unit: 'kcal' },
  protein_g: { label: 'Protein', unit: 'g' },
  carbs_g: { label: 'Carbs', unit: 'g' },
  fat_g: { label: 'Fat', unit: 'g' },
  fiber_g: { label: 'Fiber', unit: 'g' },
  sodium_mg: { label: 'Sodium', unit: 'mg' },
  sat_fat_g: { label: 'Saturated fat', unit: 'g' },
  added_sugar_g: { label: 'Added sugar', unit: 'g' },
};

const STATUS_TEXT: Readonly<Record<TargetStatus, string>> = {
  under: 'Below target',
  on_target: 'On target',
  over: 'Above target',
  met: 'Target met',
  short: 'Short of target',
  within: 'Within limit',
  info: 'For reference',
};

export interface NutrientRow {
  readonly nutrient: TargetNutrient;
  readonly label: string;
  readonly unit: string;
  readonly value: number;
  readonly target: number;
  /** value / target, for the bar; may exceed 1. */
  readonly ratio: number;
  readonly status: TargetStatus;
  readonly statusText: string;
  /** Whether the status is the good outcome for this nutrient. */
  readonly good: boolean;
  /** `limit` for nutrients to stay under, `target` otherwise. */
  readonly noun: 'limit' | 'target';
}

function statusText(nutrient: TargetNutrient, status: TargetStatus): string {
  if (status === 'over' && TARGET_KIND[nutrient] === 'max') return 'Over limit';
  return STATUS_TEXT[status];
}

export function nutrientRows(day: PlannedDay, targets: DailyTargets): NutrientRow[] {
  return SHOWN_NUTRIENTS.map((nutrient) => {
    const value = day.totals[nutrient];
    const target = targets[nutrient];
    const status = day.status[nutrient];
    return {
      nutrient,
      ...NUTRIENT_NAMES[nutrient],
      value,
      target,
      ratio: target > 0 ? value / target : 0,
      status,
      statusText: statusText(nutrient, status),
      good: status === 'on_target' || status === 'met' || status === 'within',
      noun: TARGET_KIND[nutrient] === 'max' ? 'limit' : 'target',
    };
  });
}

export interface WeekWrites {
  readonly week: IsoDate;
  readonly writes: readonly SlotWrite[];
}

/**
 * Slot writes for a plan starting on `start`, grouped by planner week (a plan that starts on a
 * Sunday spans two weeks). Each write keeps the portion the plan was balanced at, so half-size
 * small meals stay half-size in the planner and on the shopping list. The planner has one snack
 * slot a day, so a day's second snack is left out; empty planned slots are skipped.
 */
export function dayPlanWrites(
  result: PlanDaysResult,
  start: IsoDate,
  servings: number,
): WeekWrites[] {
  const byWeek = new Map<IsoDate, SlotWrite[]>();
  for (const day of result.days) {
    const { week, day: dayIndex } = locateDate(addDays(start, day.index));
    const writes = byWeek.get(week) ?? [];
    const used = new Set<string>();
    for (const meal of day.meals) {
      if (meal.recipeId === null || used.has(meal.slot)) continue;
      used.add(meal.slot);
      writes.push({
        slot: slotKey(dayIndex, meal.slot),
        recipeId: meal.recipeId,
        servings: Math.max(1, servings),
        portion: storedPortion(meal.portion),
      });
    }
    byWeek.set(week, writes);
  }
  return [...byWeek].map(([week, writes]) => ({ week, writes }));
}

/** "Today", "Tomorrow", then the weekday name. */
export function planDayTitle(index: number, weekday: string): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  return weekday;
}
