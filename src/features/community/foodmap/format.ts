/** Distances, times and days on the food map, in the device's own units and format. */
import { deviceLocale } from '@/lib/format';

import { distanceUnitFor, formatDistance } from '../deps';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}:${JSON.stringify(options)}`;
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, cached);
  }
  return cached;
}

/** "350 m", "0.3 mi". */
export function distanceLabel(meters: number, locale = deviceLocale()): string {
  return formatDistance(meters, distanceUnitFor(locale));
}

/** "7:40 PM", or "19:40" where the device uses a 24-hour clock. */
export function timeOfDayLabel(iso: string, locale = deviceLocale()): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  return formatter(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
}

/** "Oct 3". */
export function dayLabel(iso: string, locale = deviceLocale()): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  return formatter(locale, { month: 'short', day: 'numeric' }).format(date);
}
