/** Defaults and labels for the "Add to plan" slot picker. */
import type { Course } from '@/lib/catalog';
import { shiftWeek, weekStartOf, type DayIndex, type Meal } from '@/stores';

export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const MEAL_LABELS: Readonly<Record<Meal, string>> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

/** The meal a recipe most naturally fills. */
export function defaultMeal(course: Course): Meal {
  switch (course) {
    case 'breakfast':
      return 'breakfast';
    case 'snack':
    case 'dessert':
    case 'drink':
      return 'snack';
    case 'salad':
    case 'soup':
    case 'side':
      return 'lunch';
    default:
      return 'dinner';
  }
}

/** Monday = 0 … Sunday = 6 for a date in local time. */
export function dayIndexOf(date: Date): DayIndex {
  return ((date.getDay() + 6) % 7) as DayIndex;
}

export type WeekChoice = 'this' | 'next';

export function weekStartFor(choice: WeekChoice, now: Date): string {
  const current = weekStartOf(now);
  return choice === 'this' ? current : shiftWeek(current, 1);
}

/** Days still ahead this week (today included); every day of next week. */
export function selectableDays(choice: WeekChoice, now: Date): DayIndex[] {
  const all: DayIndex[] = [0, 1, 2, 3, 4, 5, 6];
  if (choice === 'next') return all;
  const today = dayIndexOf(now);
  return all.filter((day) => day >= today);
}
