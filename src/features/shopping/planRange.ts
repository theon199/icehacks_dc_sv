/**
 * Which planned meals a shopping list covers. The person picks a range of days; every planned
 * slot on those days contributes its recipe and servings.
 */
import { addDays, daysBetween, dayIndexOf, weekStartOf, type IsoDate } from '@/domain/plan';
import { MEALS, slotKey, type Meal, type PlanWeek } from '@/stores/mealPlan';

export const RANGE_PRESETS = ['thisWeek', 'next7', 'nextWeek'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const RANGE_LABELS: Readonly<Record<RangePreset, string>> = {
  thisWeek: 'Rest of week',
  next7: 'Next 7 days',
  nextWeek: 'Next week',
};

/** Inclusive range of calendar days. */
export interface DateRange {
  readonly from: IsoDate;
  readonly to: IsoDate;
}

export function rangeFor(preset: RangePreset, today: IsoDate): DateRange {
  const monday = weekStartOf(today);
  switch (preset) {
    case 'thisWeek':
      return { from: today, to: addDays(monday, 6) };
    case 'next7':
      return { from: today, to: addDays(today, 6) };
    case 'nextWeek':
      return { from: addDays(monday, 7), to: addDays(monday, 13) };
  }
}

export function datesIn(range: DateRange): IsoDate[] {
  const days = daysBetween(range.from, range.to);
  const out: IsoDate[] = [];
  for (let i = 0; i <= days; i += 1) out.push(addDays(range.from, i));
  return out;
}

export interface PlannedMealRef {
  readonly date: IsoDate;
  readonly meal: Meal;
  readonly recipeId: string;
  readonly servings: number;
}

/** Planned slots on the range's days, in date then meal order. */
export function plannedMealsInRange(
  weeks: Readonly<Record<string, PlanWeek>>,
  range: DateRange,
): PlannedMealRef[] {
  const out: PlannedMealRef[] = [];
  for (const date of datesIn(range)) {
    const week = weeks[weekStartOf(date)];
    if (!week) continue;
    const day = dayIndexOf(date);
    for (const meal of MEALS) {
      const entry = week.slots[slotKey(day, meal)];
      if (entry) out.push({ date, meal, recipeId: entry.recipeId, servings: entry.servings });
    }
  }
  return out;
}

/** Distinct recipe ids, first appearance first. */
export function recipeIdsOf(meals: readonly PlannedMealRef[]): string[] {
  return [...new Set(meals.map((meal) => meal.recipeId))];
}

const SHORT_DATE = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

function shortDate(iso: IsoDate): string {
  return SHORT_DATE.format(new Date(`${iso}T00:00:00Z`));
}

/** "Wed, Nov 11 – Sun, Nov 15". */
export function rangeLabel(range: DateRange): string {
  return range.from === range.to
    ? shortDate(range.from)
    : `${shortDate(range.from)} – ${shortDate(range.to)}`;
}
