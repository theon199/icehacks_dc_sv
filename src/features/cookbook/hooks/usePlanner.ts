/**
 * Planner reads (selector hooks over the meal plan store) and writes (plain functions over the
 * store's actions). Writes read the store at call time, so components can call them from handlers
 * without re-rendering when unrelated plan data changes.
 */
import { useMemo } from 'react';

import { weekStartOf, type DayIndex, type IsoDate, type MealSlot } from '@/domain/plan';
import {
  MEALS,
  selectWeekSlots,
  slotKey,
  useMealPlanStore,
  usePreferencesStore,
  type MealPlanState,
  type PlanWeek,
} from '@/stores';

import type { SlotWrite } from '../model/week';

export interface SlotRef {
  readonly week: IsoDate;
  readonly day: DayIndex;
  readonly slot: MealSlot;
}

export function useWeekSlots(weekStart: IsoDate): PlanWeek['slots'] {
  const select = useMemo(() => selectWeekSlots(weekStart), [weekStart]);
  return useMealPlanStore(select);
}

export function useIsWeekArchived(weekStart: IsoDate): boolean {
  return useMealPlanStore((s) => s.weeks[weekStart]?.archivedAt != null);
}

/** True when a week before the current one still has meals and is not archived. */
export function hasPastActiveWeeks(state: Pick<MealPlanState, 'weeks'>, today: IsoDate): boolean {
  const current = weekStartOf(today);
  return Object.values(state.weeks).some(
    (w) => w.weekStart < current && w.archivedAt == null && Object.keys(w.slots).length > 0,
  );
}

export function usePastActiveWeeks(today: IsoDate): boolean {
  return useMealPlanStore((s) => hasPastActiveWeeks(s, today));
}

export function useArchivedCount(): number {
  return useMealPlanStore((s) => Object.values(s.weeks).filter((w) => w.archivedAt != null).length);
}

function defaultServings(): number {
  return usePreferencesStore.getState().prefs.householdSize;
}

const plan = () => useMealPlanStore.getState();

/** Archived weeks are read-only until restored; every write checks this at call time. */
export function isWeekArchived(week: IsoDate): boolean {
  return plan().weeks[week]?.archivedAt != null;
}

export const plannerActions = {
  /**
   * Put a recipe in a slot, replacing whatever was there. Returns false (and writes nothing) when
   * the week is archived.
   */
  place(ref: SlotRef, recipeId: string, servings = defaultServings()): boolean {
    if (isWeekArchived(ref.week)) return false;
    plan().setSlot(ref.week, slotKey(ref.day, ref.slot), { recipeId, servings });
    return true;
  },
  /**
   * Move a meal; a meal already in the destination trades places with it. Refused when either
   * week is archived.
   */
  move(from: SlotRef, to: SlotRef): boolean {
    if (isWeekArchived(from.week) || isWeekArchived(to.week)) return false;
    plan().moveSlot(
      { weekStart: from.week, slot: slotKey(from.day, from.slot) },
      { weekStart: to.week, slot: slotKey(to.day, to.slot) },
    );
    return true;
  },
  /**
   * Put a recipe back into a slot only if the slot is still empty (undo after a removal must not
   * overwrite a meal planned there since). Returns whether it was placed.
   */
  restoreIfEmpty(ref: SlotRef, recipeId: string, servings: number): boolean {
    if (plan().weeks[ref.week]?.slots[slotKey(ref.day, ref.slot)]) return false;
    return plannerActions.place(ref, recipeId, servings);
  },
  clear(ref: SlotRef): void {
    if (isWeekArchived(ref.week)) return;
    plan().clearSlot(ref.week, slotKey(ref.day, ref.slot));
  },
  clearDay(week: IsoDate, day: DayIndex): void {
    if (isWeekArchived(week)) return;
    const { clearSlot } = plan();
    for (const meal of MEALS) clearSlot(week, slotKey(day, meal));
  },
  clearWeek(week: IsoDate): void {
    plan().removeWeek(week);
  },
  /**
   * Write planner output into a week, leaving occupied slots untouched (an archived week takes
   * none). Returns how many landed.
   */
  applyWrites(week: IsoDate, writes: readonly SlotWrite[]): number {
    if (isWeekArchived(week)) return 0;
    let placed = 0;
    for (const write of writes) {
      const store = plan();
      if (store.weeks[week]?.slots[write.slot]) continue;
      store.setSlot(week, write.slot, { recipeId: write.recipeId, servings: write.servings });
      if (plan().weeks[week]?.slots[write.slot]) placed += 1;
    }
    return placed;
  },
  /** Archive every week that ended before today's week (empty ones are dropped). */
  archivePast(now: Date = new Date()): void {
    plan().rollover(now);
  },
  archive(week: IsoDate): void {
    plan().archiveWeek(week);
  },
  restore(week: IsoDate): void {
    plan().unarchiveWeek(week);
  },
  deleteWeek(week: IsoDate): void {
    plan().removeWeek(week);
  },
};
