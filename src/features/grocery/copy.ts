/**
 * Words the cost summary uses, kept together so the component files stay about layout and the
 * wording can be tested on its own.
 */
import type { PricesNotice } from '@/lib/api/commerce';

import type { MissingItem, MissingReason } from './pricing';

export const REASON_LABEL: Readonly<Record<MissingReason, string>> = {
  checking: 'Checking the price',
  no_price: 'No store price found',
  unavailable: 'Price not available right now',
  not_comparable: "Package size can't be matched to the amount needed",
  no_amount: 'No amount given, so it is not counted',
};

/** Why saved prices are all that is shown, when lookups cannot run. */
export function noticeMessage(notice: PricesNotice | null, failed: boolean): string | null {
  switch (notice) {
    case 'daily_limit':
      return "You've used today's price lookups. Saved prices are shown.";
    case 'budget':
      return 'Price lookups are paused for now. Saved prices are shown.';
    case 'not_eligible':
      return 'New price lookups need an adult account. Saved prices are shown.';
    case 'not_configured':
      return "Price lookups aren't available right now.";
    default:
      return failed ? "Couldn't reach the price service. Saved prices are shown." : null;
  }
}

function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

/** "Leaves out tahini and sumac (no price yet)." or null when nothing is missing. */
export function missingMessage(missing: readonly MissingItem[]): string | null {
  if (missing.length === 0) return null;
  const names = listNames(missing.map((m) => m.name));
  const noun = missing.length === 1 ? 'item' : 'items';
  return `Leaves out ${missing.length} ${noun} without a usable price: ${names}.`;
}

/** "Checking 3 more prices…" or null. */
export function checkingMessage(checking: readonly MissingItem[]): string | null {
  if (checking.length === 0) return null;
  return checking.length === 1
    ? `Checking the price of ${checking[0]?.name ?? 'one item'}…`
    : `Checking ${checking.length} more prices…`;
}

/** "Prices from Kroger" / "Prices from Kroger and Target" / "Prices from Kroger and 3 more". */
export function retailersMessage(retailers: readonly string[]): string | null {
  if (retailers.length === 0) return null;
  if (retailers.length === 1) return `Prices from ${retailers[0]}`;
  if (retailers.length === 2) return `Prices from ${retailers[0]} and ${retailers[1]}`;
  return `Prices from ${retailers[0]} and ${retailers.length - 1} more stores`;
}
