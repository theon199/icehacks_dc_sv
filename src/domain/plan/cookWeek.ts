import { addDays, weekStartOf, type IsoDate } from './dates';

export interface CookWeekDay {
  date: IsoDate;
  /** One-letter weekday, Monday first. */
  letter: string;
  cooked: boolean;
  isToday: boolean;
  /** Later this week: nothing can have been cooked yet. */
  isFuture: boolean;
}

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

/** Monday to Sunday of the week containing `today`, marking the days with a logged cook. */
export function cookWeek(today: IsoDate, cookedDates: readonly IsoDate[]): CookWeekDay[] {
  const cooked = new Set(cookedDates);
  const monday = weekStartOf(today);
  return LETTERS.map((letter, index) => {
    const date = addDays(monday, index);
    return {
      date,
      letter,
      cooked: cooked.has(date),
      isToday: date === today,
      isFuture: date > today,
    };
  });
}
