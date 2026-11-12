/**
 * Locale-aware display formatting for durations, energy, mass and relative time.
 *
 * Built on `Intl`, with fallbacks for engines that lack some Intl features (Hermes does not ship
 * every formatter on every platform). Every function accepts an optional locale so it is
 * deterministic in tests; by default the device's preferred locale is used.
 */
import { getLocales } from 'expo-localization';

const FALLBACK_LOCALE = 'en-US';

export function deviceLocale(): string {
  try {
    return getLocales()[0]?.languageTag ?? FALLBACK_LOCALE;
  } catch {
    return FALLBACK_LOCALE;
  }
}

const numberFormatCache = new Map<string, Intl.NumberFormat>();

function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = numberFormatCache.get(key);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat(locale, options);
    } catch {
      formatter = new Intl.NumberFormat(FALLBACK_LOCALE, { maximumFractionDigits: 1 });
    }
    numberFormatCache.set(key, formatter);
  }
  return formatter;
}

/** Plain localized number, e.g. 1234.5 → "1,234.5". */
export function formatNumber(value: number, maximumFractionDigits = 1, locale = deviceLocale()) {
  return numberFormat(locale, { maximumFractionDigits }).format(value);
}

/**
 * Cooking duration: 45 → "45 min", 60 → "1 hr", 75 → "1 hr 15 min". Non-finite or negative input
 * returns an em dash so a missing value never renders as "NaN min".
 */
export function formatMinutes(totalMinutes: number | null | undefined, locale = deviceLocale()) {
  if (totalMinutes == null || !Number.isFinite(totalMinutes) || totalMinutes < 0) return '—';
  const rounded = Math.round(totalMinutes);
  if (rounded < 60) return `${formatNumber(rounded, 0, locale)} min`;
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  const hourPart = `${formatNumber(hours, 0, locale)} hr`;
  return minutes === 0 ? hourPart : `${hourPart} ${formatNumber(minutes, 0, locale)} min`;
}

/** Timer display: 125 → "2:05", 3725 → "1:02:05". */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Energy, rounded to whole kilocalories: 512.4 → "512 kcal". */
export function formatKcal(kcal: number | null | undefined, locale = deviceLocale()) {
  if (kcal == null || !Number.isFinite(kcal)) return '—';
  return `${formatNumber(Math.round(kcal), 0, locale)} kcal`;
}

/**
 * Mass in grams with sensible precision: under 10 g keeps one decimal (2.5 g), otherwise whole
 * grams. Values of 1000 g and more switch to kilograms.
 */
export function formatGrams(grams: number | null | undefined, locale = deviceLocale()) {
  if (grams == null || !Number.isFinite(grams)) return '—';
  if (Math.abs(grams) >= 1000) return `${formatNumber(grams / 1000, 2, locale)} kg`;
  const digits = Math.abs(grams) < 10 ? 1 : 0;
  return `${formatNumber(grams, digits, locale)} g`;
}

/** Milligrams, used for sodium: 1234 → "1,234 mg". */
export function formatMilligrams(mg: number | null | undefined, locale = deviceLocale()) {
  if (mg == null || !Number.isFinite(mg)) return '—';
  return `${formatNumber(Math.round(mg), 0, locale)} mg`;
}

/** Fraction 0..1 as a percentage: 0.234 → "23%". */
export function formatPercent(fraction: number, locale = deviceLocale()) {
  if (!Number.isFinite(fraction)) return '—';
  return numberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(fraction);
}

type RelativeUnit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

const RELATIVE_STEPS: { unit: RelativeUnit; seconds: number }[] = [
  { unit: 'year', seconds: 31_536_000 },
  { unit: 'month', seconds: 2_592_000 },
  { unit: 'week', seconds: 604_800 },
  { unit: 'day', seconds: 86_400 },
  { unit: 'hour', seconds: 3_600 },
  { unit: 'minute', seconds: 60 },
];

function englishRelative(value: number, unit: RelativeUnit): string {
  const abs = Math.abs(value);
  const label = `${abs} ${unit}${abs === 1 ? '' : 's'}`;
  return value < 0 ? `${label} ago` : `in ${label}`;
}

/**
 * Relative time from `now`: "just now", "5 minutes ago", "yesterday", "in 2 days".
 * `date` may be a Date, epoch milliseconds or an ISO string.
 */
export function formatRelativeTime(
  date: Date | number | string,
  now: Date | number = Date.now(),
  locale = deviceLocale(),
): string {
  const then = typeof date === 'string' ? Date.parse(date) : +date;
  if (!Number.isFinite(then)) return '—';
  const diffSeconds = Math.round((then - +now) / 1000);
  if (Math.abs(diffSeconds) < 45) return 'just now';

  const step = RELATIVE_STEPS.find((s) => Math.abs(diffSeconds) >= s.seconds) ?? {
    unit: 'minute' as const,
    seconds: 60,
  };
  const value = Math.round(diffSeconds / step.seconds);

  if (typeof Intl.RelativeTimeFormat === 'function') {
    try {
      return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, step.unit);
    } catch {
      // Fall through to the English fallback below.
    }
  }
  if (step.unit === 'day' && value === -1) return 'yesterday';
  if (step.unit === 'day' && value === 1) return 'tomorrow';
  return englishRelative(value, step.unit);
}
