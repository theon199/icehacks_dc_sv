/**
 * Display formatting for grocery costs: money in integer cents, package sizes and the date a
 * price was checked. Each function takes an optional locale so tests are deterministic.
 */
import { deviceLocale } from '@/lib/format';

const currencyFormats = new Map<string, Intl.NumberFormat>();

function currencyFormat(locale: string, currency: string, wholeDollars: boolean) {
  const key = `${locale}|${currency}|${wholeDollars ? 0 : 2}`;
  let format = currencyFormats.get(key);
  if (!format) {
    const digits = wholeDollars ? 0 : 2;
    try {
      format = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
    } catch {
      format = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
    }
    currencyFormats.set(key, format);
  }
  return format;
}

/**
 * Money from integer cents: 1234 → "$12.34". Amounts of $100 or more drop the cents, since an
 * estimate that large is not accurate to the cent. Non-finite input renders as an em dash.
 */
export function formatCents(
  cents: number | null | undefined,
  { currency = 'USD', locale = deviceLocale() }: { currency?: string; locale?: string } = {},
): string {
  if (cents == null || !Number.isFinite(cents)) return '—';
  const wholeDollars = Math.abs(cents) >= 10_000;
  const amount = wholeDollars ? Math.round(cents / 100) : cents / 100;
  return currencyFormat(locale, currency, wholeDollars).format(amount);
}

/** Words for the package units the price lookup reports. */
const PACKAGE_UNIT_WORDS: Readonly<Record<string, readonly [string, string]>> = {
  each: ['item', 'items'],
  count: ['item', 'items'],
  dozen: ['dozen', 'dozen'],
  bunch: ['bunch', 'bunches'],
  lb: ['lb', 'lb'],
  oz: ['oz', 'oz'],
  fl_oz: ['fl oz', 'fl oz'],
  g: ['g', 'g'],
  kg: ['kg', 'kg'],
  ml: ['ml', 'ml'],
  l: ['L', 'L'],
  gal: ['gal', 'gal'],
  qt: ['qt', 'qt'],
  pt: ['pt', 'pt'],
};

/** "16 oz", "1 dozen", "3 items"; null when the size is unknown. */
export function formatPackage(
  qty: number | null | undefined,
  unit: string | null | undefined,
  locale = deviceLocale(),
): string | null {
  if (!unit) return null;
  const words = PACKAGE_UNIT_WORDS[unit] ?? [unit, unit];
  const amount = qty != null && Number.isFinite(qty) && qty > 0 ? qty : 1;
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(amount);
  return `${number} ${amount === 1 ? words[0] : words[1]}`;
}

/** The day a price was checked, e.g. "Nov 3, 2026"; null when the timestamp is unreadable. */
export function formatCheckedDate(iso: string | null | undefined, locale = deviceLocale()) {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(time);
  } catch {
    return new Date(time).toISOString().slice(0, 10);
  }
}
