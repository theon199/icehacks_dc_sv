const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export interface PlanDay {
  weekday: string;
  day: number;
  month: string;
}

/** `count` consecutive days starting today, in local time. */
export function planDays(now: Date, count: number): PlanDay[] {
  return Array.from({ length: count }, (_unused, offset) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    return {
      weekday: WEEKDAYS[date.getDay()] ?? '',
      day: date.getDate(),
      month: MONTHS[date.getMonth()] ?? '',
    };
  });
}

/** "Nov 14–16", or "Nov 30–Dec 2" across a month end. */
export function planRangeLabel(days: readonly PlanDay[]): string {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return '';
  if (first === last) return `${first.month} ${first.day}`;
  const end = last.month === first.month ? `${last.day}` : `${last.month} ${last.day}`;
  return `${first.month} ${first.day}–${end}`;
}
