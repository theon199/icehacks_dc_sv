/**
 * Planner week helpers for the Cookbook UI: labels for the week pager and day rail, reading a
 * stored week as the planner domain's `WeekPlan`, and turning planner output back into slot
 * writes. Pure; every date comes in as an ISO day so tests never depend on the clock.
 */
import {
  addDays,
  cellKey,
  DAY_INDICES,
  daysBetween,
  dayIndexOf,
  isValidWeekStart,
  MEAL_SLOTS,
  parseIsoDate,
  weekStartOf,
  type CellKey,
  type DayIndex,
  type FillAssignment,
  type IsoDate,
  type MealSlot,
  type PlannedMeal,
  type WeekPlan,
} from '@/domain/plan';
import {
  entryPortion,
  MAX_PORTION,
  MIN_PORTION,
  slotKey,
  type PlanEntry,
  type PlanWeek,
  type SlotKey,
} from '@/stores';

export const SLOT_LABELS: Readonly<Record<MealSlot, string>> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = formatters.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
    } catch {
      f = new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' });
    }
    formatters.set(key, f);
  }
  return f;
}

function utc(iso: IsoDate): Date {
  return new Date(parseIsoDate(iso) ?? 0);
}

/** "Nov 9 – 15", or "Nov 30 – Dec 6" when the week spans two months. */
export function weekRangeLabel(weekStart: IsoDate, locale = 'en-US'): string {
  const end = addDays(weekStart, 6);
  const monthDay = formatter(locale, { month: 'short', day: 'numeric' });
  const dayOnly = formatter(locale, { day: 'numeric' });
  const sameMonth = weekStart.slice(0, 7) === end.slice(0, 7);
  const tail = sameMonth ? dayOnly.format(utc(end)) : monthDay.format(utc(end));
  return `${monthDay.format(utc(weekStart))} – ${tail}`;
}

/** Whole weeks from the current week to `weekStart` (negative for past weeks). */
export function weekOffset(weekStart: IsoDate, today: IsoDate): number {
  return Math.round(daysBetween(weekStartOf(today), weekStart) / 7);
}

/** "This week", "Next week", "Last week", or the date range further out. */
export function weekTitle(weekStart: IsoDate, today: IsoDate, locale = 'en-US'): string {
  switch (weekOffset(weekStart, today)) {
    case 0:
      return 'This week';
    case 1:
      return 'Next week';
    case -1:
      return 'Last week';
    default:
      return weekRangeLabel(weekStart, locale);
  }
}

export interface DayInfo {
  readonly day: DayIndex;
  readonly date: IsoDate;
  /** "Mon" */
  readonly short: string;
  /** "Monday" */
  readonly weekday: string;
  /** "9" */
  readonly dayOfMonth: string;
  /** "Monday, November 9" — for VoiceOver and headings. */
  readonly long: string;
  readonly isToday: boolean;
  readonly isPast: boolean;
}

export function weekDays(weekStart: IsoDate, today: IsoDate, locale = 'en-US'): DayInfo[] {
  const short = formatter(locale, { weekday: 'short' });
  const weekday = formatter(locale, { weekday: 'long' });
  const long = formatter(locale, { weekday: 'long', month: 'long', day: 'numeric' });
  return DAY_INDICES.map((day) => {
    const date = addDays(weekStart, day);
    return {
      day,
      date,
      short: short.format(utc(date)),
      weekday: weekday.format(utc(date)),
      dayOfMonth: String(Number(date.slice(8))),
      long: long.format(utc(date)),
      isToday: date === today,
      isPast: date < today,
    };
  });
}

/** The day to show first for a week: today in the current week, otherwise Monday. */
export function initialDay(weekStart: IsoDate, today: IsoDate): DayIndex {
  return weekStartOf(today) === weekStart ? dayIndexOf(today) : 0;
}

/** Store slot key ↔ planner cell key. */
export function toCellKey(key: SlotKey): CellKey {
  const [day, slot] = key.split('-') as [string, MealSlot];
  return cellKey(Number(day) as DayIndex, slot);
}

/**
 * A stored week as the planner domain reads it. Each meal counts at the portion it is shown and
 * bought at (`entryPortion`): the one it was planned at, or the small-appetite setting's for a meal
 * stored without one, so auto-fill balances the rest of the week against what will be eaten.
 */
export function toWeekPlan(
  week: PlanWeek | undefined,
  weekStart: IsoDate,
  smallAppetite: boolean,
): WeekPlan {
  const cells: Partial<Record<CellKey, PlannedMeal>> = {};
  if (week) {
    for (const [key, entry] of Object.entries(week.slots) as [SlotKey, PlanEntry][]) {
      const meal = key.split('-')[1] as MealSlot;
      cells[toCellKey(key)] = {
        recipeId: entry.recipeId,
        servings: entry.servings,
        portion: entryPortion(entry, meal, smallAppetite),
      };
    }
  }
  return { weekStart, cells, updatedAt: null };
}

export interface SlotWrite {
  readonly slot: SlotKey;
  readonly recipeId: string;
  readonly servings: number;
  /** Portion size the planner chose (0.5 for a small meal); omitted means a standard portion. */
  readonly portion?: number;
}

/** A planner's portion as the store keeps it: within the stored range, two decimals at most. */
export function storedPortion(portion: number): number {
  if (!Number.isFinite(portion) || portion <= 0) return 1;
  const clamped = Math.min(MAX_PORTION, Math.max(MIN_PORTION, portion));
  return Math.round(clamped * 100) / 100;
}

/**
 * Planner assignments as store writes. Servings are whole numbers of at least one, and every write
 * carries the planner's portion so a small-meals plan stays small once saved.
 */
export function toSlotWrites(assignments: readonly FillAssignment[]): SlotWrite[] {
  return assignments.map((a) => ({
    slot: slotKey(a.day, a.slot),
    recipeId: a.meal.recipeId,
    servings: Math.max(1, Math.round(a.meal.servings)),
    portion: storedPortion(a.meal.portion),
  }));
}

export interface DayMeal {
  readonly slot: MealSlot;
  readonly key: SlotKey;
  readonly entry: PlanEntry | undefined;
}

export function mealsForDay(slots: PlanWeek['slots'], day: DayIndex): DayMeal[] {
  return MEAL_SLOTS.map((slot) => {
    const key = slotKey(day, slot);
    return { slot, key, entry: slots[key] };
  });
}

/** One planned meal as the week's cost estimate reads it. */
export interface WeekCostRecipe {
  readonly recipeId: string;
  /** Standard servings to buy for: planned servings × the meal's portion. */
  readonly servings: number;
}

/**
 * Every meal of a week, Monday breakfast first, as recipes to cost. Each meal counts at its
 * planned servings scaled by its portion, the same amounts the shopping list buys, so a week of
 * half-size meals is costed at half the food. A recipe planned twice counts twice.
 */
export function weekCostRecipes(
  slots: PlanWeek['slots'],
  smallAppetite: boolean,
): WeekCostRecipe[] {
  const out: WeekCostRecipe[] = [];
  for (const day of DAY_INDICES) {
    for (const slot of MEAL_SLOTS) {
      const entry = slots[slotKey(day, slot)];
      if (!entry) continue;
      const servings = entry.servings * entryPortion(entry, slot, smallAppetite);
      out.push({ recipeId: entry.recipeId, servings });
    }
  }
  return out;
}

/** Number of planned meals per day of the week, Monday first. */
export function mealsPerDay(slots: PlanWeek['slots']): number[] {
  const counts = DAY_INDICES.map(() => 0);
  for (const key of Object.keys(slots)) {
    const day = Number(key.slice(0, 1));
    counts[day] = (counts[day] ?? 0) + 1;
  }
  return counts;
}

/** Days still ahead in the week (today included); all seven for a future week, none for a past one. */
export function remainingDays(weekStart: IsoDate, today: IsoDate): DayIndex[] {
  const current = weekStartOf(today);
  if (weekStart > current) return [...DAY_INDICES];
  if (weekStart < current) return [];
  const from = dayIndexOf(today);
  return DAY_INDICES.filter((d) => d >= from);
}

/** Where a planned day lands in the planner: its week and day of week. */
export function locateDate(date: IsoDate): { week: IsoDate; day: DayIndex } {
  return { week: weekStartOf(date), day: dayIndexOf(date) };
}

/** The slot a recipe of this course most naturally goes in. */
export function defaultSlotFor(course: string): MealSlot {
  if (course === 'breakfast') return 'breakfast';
  if (course === 'snack' || course === 'side' || course === 'dessert' || course === 'drink') {
    return 'snack';
  }
  return 'dinner';
}

/** A week id from a route parameter, falling back to the current week when it is not a Monday. */
export function resolveWeekParam(param: string | undefined, today: IsoDate): IsoDate {
  return param !== undefined && isValidWeekStart(param) ? param : weekStartOf(today);
}
