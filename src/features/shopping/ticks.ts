/**
 * Ticks are keyed by item, not by list, so the same key comes back whenever that ingredient is
 * planned again. A tick belongs to one shopping trip: once it is a few days old it is from an
 * earlier trip, and leaving it would show next week's eggs as already in the basket.
 */
import type { ShoppingCheck } from '@/stores/shopping';

/** How long a tick outlives the trip it was made on. */
export const TICK_LIFETIME_MS = 3 * 24 * 60 * 60 * 1000;

/** Keys of ticks made more than `TICK_LIFETIME_MS` before `now` (or with an unreadable time). */
export function staleTickKeys(
  checked: Readonly<Record<string, ShoppingCheck>>,
  now: Date,
): string[] {
  const cutoff = now.getTime() - TICK_LIFETIME_MS;
  return Object.values(checked)
    .filter((check) => {
      const at = Date.parse(check.checkedAt);
      return !Number.isFinite(at) || at < cutoff;
    })
    .map((check) => check.key);
}
