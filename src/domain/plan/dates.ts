/**
 * Calendar helpers for the planner. Dates are ISO calendar days ("2026-11-09") with no time zone;
 * arithmetic is done in UTC so daylight-saving changes never shift a day. Weeks start on Monday.
 */

/** A calendar day as `YYYY-MM-DD`. */
export type IsoDate = string;

/** Day of the planner week: 0 = Monday … 6 = Sunday. */
export type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DAY_INDICES: readonly DayIndex[] = [0, 1, 2, 3, 4, 5, 6];

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/** Parse an ISO day; returns epoch ms at UTC midnight or `null` when the text is not a real date. */
export function parseIsoDate(iso: string): number | null {
  const m = ISO_RE.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    return null;
  }
  return ms;
}

export function isIsoDate(value: string): boolean {
  return parseIsoDate(value) !== null;
}

function fromUtcMs(ms: number): IsoDate {
  const d = new Date(ms);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function mustParse(iso: IsoDate): number {
  const ms = parseIsoDate(iso);
  if (ms === null) throw new RangeError(`Not an ISO calendar date: ${iso}`);
  return ms;
}

/** The person's local calendar day for an injected instant. */
export function localIsoDate(now: Date): IsoDate {
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  return fromUtcMs(mustParse(iso) + Math.trunc(days) * DAY_MS);
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((mustParse(b) - mustParse(a)) / DAY_MS);
}

/** Monday-based day index of a date. */
export function dayIndexOf(iso: IsoDate): DayIndex {
  // getUTCDay: 0 = Sunday. Shift so Monday is 0.
  return ((new Date(mustParse(iso)).getUTCDay() + 6) % 7) as DayIndex;
}

/** The Monday that starts the week containing `iso`. */
export function weekStartOf(iso: IsoDate): IsoDate {
  return addDays(iso, -dayIndexOf(iso));
}

/** The seven dates of the week starting `weekStart` (which should be a Monday). */
export function weekDates(weekStart: IsoDate): readonly IsoDate[] {
  return DAY_INDICES.map((i) => addDays(weekStart, i));
}

export function isWeekend(day: DayIndex): boolean {
  return day >= 5;
}
