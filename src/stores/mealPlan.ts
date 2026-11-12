/**
 * The weekly planner: Monday-to-Sunday weeks of breakfast, lunch, dinner and snack slots. Each
 * week is one synced document keyed by its Monday (`YYYY-MM-DD`, local calendar). Past weeks are
 * archived rather than deleted, and the archive keeps the most recent year.
 */
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { createSelector } from './memo';
import { versionedPersist } from './persistence';
import { applyToRecord, createCollectionAdapter } from './syncAdapter';

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type Meal = (typeof MEALS)[number];
/** 0 = Monday ... 6 = Sunday. */
export type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type SlotKey = `${DayIndex}-${Meal}`;
export const MAX_ARCHIVED_WEEKS = 52;

const SLOT_PATTERN = /^[0-6]-(breakfast|lunch|dinner|snack)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const planEntrySchema = z.object({
  recipeId: z.string().min(1).max(128),
  servings: z.number().int().min(1).max(20),
  addedAt: z.string(),
});
export type PlanEntry = z.infer<typeof planEntrySchema>;

export const planWeekSchema = z.object({
  weekStart: z.string().regex(DATE_PATTERN),
  slots: z.record(z.string().regex(SLOT_PATTERN), planEntrySchema),
  archivedAt: z.string().nullable(),
});
export type PlanWeek = z.infer<typeof planWeekSchema>;

type Weeks = Readonly<Record<string, PlanWeek>>;

export function slotKey(day: DayIndex, meal: Meal): SlotKey {
  return `${day}-${meal}`;
}

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** The Monday of the local calendar week containing `date`, as `YYYY-MM-DD`. */
export function weekStartOf(date: Date): string {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return localDate(monday);
}

/** `weekStart` moved by whole weeks. */
export function shiftWeek(weekStart: string, weeks: number): string {
  const [y, m, d] = weekStart.split('-').map(Number) as [number, number, number];
  return localDate(new Date(y, m - 1, d + weeks * 7));
}

const emptyWeek = (weekStart: string): PlanWeek => ({ weekStart, slots: {}, archivedAt: null });

function withWeek(weeks: Weeks, week: PlanWeek): Weeks {
  return { ...weeks, [week.weekStart]: week };
}

export function setSlot(
  weeks: Weeks,
  weekStart: string,
  slot: SlotKey,
  entry: { recipeId: string; servings: number },
  at: string,
): Weeks {
  if (!DATE_PATTERN.test(weekStart) || !SLOT_PATTERN.test(slot)) return weeks;
  const parsed = planEntrySchema.safeParse({ ...entry, addedAt: at });
  if (!parsed.success) return weeks;
  const week = weeks[weekStart] ?? emptyWeek(weekStart);
  const current = week.slots[slot];
  if (current && current.recipeId === entry.recipeId && current.servings === entry.servings) {
    return weeks;
  }
  return withWeek(weeks, { ...week, slots: { ...week.slots, [slot]: parsed.data } });
}

export function clearSlot(weeks: Weeks, weekStart: string, slot: SlotKey): Weeks {
  const week = weeks[weekStart];
  if (!week?.slots[slot]) return weeks;
  const slots = { ...week.slots };
  delete slots[slot];
  return withWeek(weeks, { ...week, slots });
}

/** Moves an entry to another slot (possibly in another week), swapping with what is there. */
export function moveSlot(
  weeks: Weeks,
  from: { weekStart: string; slot: SlotKey },
  to: { weekStart: string; slot: SlotKey },
): Weeks {
  const source = weeks[from.weekStart]?.slots[from.slot];
  if (!source || !DATE_PATTERN.test(to.weekStart) || !SLOT_PATTERN.test(to.slot)) return weeks;
  if (from.weekStart === to.weekStart && from.slot === to.slot) return weeks;
  const target = weeks[to.weekStart]?.slots[to.slot];

  let next = clearSlot(weeks, from.weekStart, from.slot);
  const toWeek = next[to.weekStart] ?? emptyWeek(to.weekStart);
  next = withWeek(next, { ...toWeek, slots: { ...toWeek.slots, [to.slot]: source } });
  if (target) {
    const fromWeek = next[from.weekStart] ?? emptyWeek(from.weekStart);
    next = withWeek(next, { ...fromWeek, slots: { ...fromWeek.slots, [from.slot]: target } });
  }
  return next;
}

export function setWeekArchived(weeks: Weeks, weekStart: string, archivedAt: string | null): Weeks {
  const week = weeks[weekStart];
  if (!week || (week.archivedAt != null) === (archivedAt != null)) return weeks;
  return trimArchive(withWeek(weeks, { ...week, archivedAt }));
}

export function removeWeek(weeks: Weeks, weekStart: string): Weeks {
  if (!weeks[weekStart]) return weeks;
  const next = { ...weeks };
  delete next[weekStart];
  return next;
}

/** Keeps only the most recent archived weeks. */
export function trimArchive(weeks: Weeks, max: number = MAX_ARCHIVED_WEEKS): Weeks {
  const archived = Object.values(weeks)
    .filter((week) => week.archivedAt != null)
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  if (archived.length <= max) return weeks;
  const next = { ...weeks };
  for (const week of archived.slice(max)) delete next[week.weekStart];
  return next;
}

/**
 * Archives weeks that ended before `currentWeekStart`; empty past weeks are simply dropped.
 */
export function rolloverWeeks(weeks: Weeks, currentWeekStart: string, at: string): Weeks {
  let next = weeks;
  for (const week of Object.values(weeks)) {
    if (week.weekStart >= currentWeekStart || week.archivedAt != null) continue;
    next =
      Object.keys(week.slots).length === 0
        ? removeWeek(next, week.weekStart)
        : withWeek(next, { ...week, archivedAt: at });
  }
  return next === weeks ? weeks : trimArchive(next);
}

export interface MealPlanState {
  weeks: Weeks;
  setSlot: (
    weekStart: string,
    slot: SlotKey,
    entry: { recipeId: string; servings: number },
    at?: string,
  ) => void;
  clearSlot: (weekStart: string, slot: SlotKey) => void;
  moveSlot: (
    from: { weekStart: string; slot: SlotKey },
    to: { weekStart: string; slot: SlotKey },
  ) => void;
  archiveWeek: (weekStart: string, at?: string) => void;
  unarchiveWeek: (weekStart: string) => void;
  removeWeek: (weekStart: string) => void;
  /** Call on launch and when the week changes. */
  rollover: (now?: Date) => void;
  reset: () => void;
}

export const useMealPlanStore = create<MealPlanState>()(
  persist(
    (set, get) => {
      const commit = (next: Weeks) => {
        if (next !== get().weeks) set({ weeks: next });
      };
      return {
        weeks: {},
        setSlot: (weekStart, slot, entry, at = new Date().toISOString()) =>
          commit(setSlot(get().weeks, weekStart, slot, entry, at)),
        clearSlot: (weekStart, slot) => commit(clearSlot(get().weeks, weekStart, slot)),
        moveSlot: (from, to) => commit(moveSlot(get().weeks, from, to)),
        archiveWeek: (weekStart, at = new Date().toISOString()) =>
          commit(setWeekArchived(get().weeks, weekStart, at)),
        unarchiveWeek: (weekStart) => commit(setWeekArchived(get().weeks, weekStart, null)),
        removeWeek: (weekStart) => commit(removeWeek(get().weeks, weekStart)),
        rollover: (now = new Date()) =>
          commit(rolloverWeeks(get().weeks, weekStartOf(now), now.toISOString())),
        reset: () => set({ weeks: {} }),
      };
    },
    versionedPersist({
      name: 'user.meal_plan',
      version: 1,
      schema: z.object({ weeks: z.record(z.string(), planWeekSchema) }),
      partialize: (state) => ({ weeks: state.weeks }),
    }),
  ),
);

const EMPTY_SLOTS: PlanWeek['slots'] = {};

/** Slots of one week (an empty object when nothing is planned). */
export const selectWeekSlots = (weekStart: string) => (state: MealPlanState) =>
  state.weeks[weekStart]?.slots ?? EMPTY_SLOTS;

export const selectActiveWeeks = createSelector(
  (state: MealPlanState) => state.weeks,
  (weeks) =>
    Object.values(weeks)
      .filter((week) => week.archivedAt == null)
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
);

export const selectArchivedWeeks = createSelector(
  (state: MealPlanState) => state.weeks,
  (weeks) =>
    Object.values(weeks)
      .filter((week) => week.archivedAt != null)
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart)),
);

/** Distinct recipe ids planned in a week, in slot order. */
export function plannedRecipeIds(week: PlanWeek | undefined): string[] {
  if (!week) return [];
  const ids: string[] = [];
  for (let day = 0; day < 7; day += 1) {
    for (const meal of MEALS) {
      const entry = week.slots[slotKey(day as DayIndex, meal)];
      if (entry && !ids.includes(entry.recipeId)) ids.push(entry.recipeId);
    }
  }
  return ids;
}

export const mealPlanSync = createCollectionAdapter({
  collection: 'meal_plan',
  store: useMealPlanStore,
  select: (state) => state.weeks,
  schema: planWeekSchema,
  // Another device can archive weeks this one has not, so the merged archive is capped as well;
  // the engine deletes what the cap drops on the server too.
  apply: (state, changes) => ({ weeks: trimArchive(applyToRecord(state.weeks, changes)) }),
});
