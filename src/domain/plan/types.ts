/**
 * The weekly planner model: weeks of Monday–Sunday × meal slots, one planned recipe per cell.
 */
import type { DayIndex, IsoDate } from './dates';

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export interface PlannedMeal {
  readonly recipeId: string;
  /** Servings to cook. */
  readonly servings: number;
  /** Size of each serving relative to a standard one (0.5 for small appetite). */
  readonly portion: number;
}

/** Cell key within a week, e.g. `"2:dinner"` for Wednesday dinner. */
export type CellKey = `${DayIndex}:${MealSlot}`;

export interface WeekPlan {
  /** Monday of the week. */
  readonly weekStart: IsoDate;
  readonly cells: Readonly<Partial<Record<CellKey, PlannedMeal>>>;
  /** ISO timestamp of the last change, injected by the caller. */
  readonly updatedAt: string | null;
}

export interface ArchivedWeek {
  readonly week: WeekPlan;
  readonly archivedAt: string;
}

export interface PlannerState {
  readonly weeks: Readonly<Record<IsoDate, WeekPlan>>;
  /** Most recently archived first. */
  readonly archive: readonly ArchivedWeek[];
}

/** A cell anywhere in the planner. */
export interface CellRef {
  readonly week: IsoDate;
  readonly day: DayIndex;
  readonly slot: MealSlot;
}

export function cellKey(day: DayIndex, slot: MealSlot): CellKey {
  return `${day}:${slot}`;
}

export function parseCellKey(key: CellKey): { day: DayIndex; slot: MealSlot } {
  const [day, slot] = key.split(':') as [string, MealSlot];
  return { day: Number(day) as DayIndex, slot };
}
