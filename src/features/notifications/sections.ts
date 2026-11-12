/**
 * Groups inbox entries under day headings ("Today", "Yesterday", weekday, date) as one flat list
 * for FlashList, which recycles headers and rows separately by type.
 */
import type { NotificationItem } from './model';

export type InboxRow =
  | { type: 'header'; key: string; title: string }
  | { type: 'item'; key: string; item: NotificationItem };

const DAY_MS = 86_400_000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/** Heading for the local calendar day of `date`, relative to `now`. */
export function dayTitle(date: Date, now: Date, locale?: string): string {
  // Round because days around daylight-saving changes are not exactly 24 hours long.
  const daysAgo = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (daysAgo <= 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  try {
    if (daysAgo < 7) return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date);
    const sameYear = date.getFullYear() === now.getFullYear();
    return new Intl.DateTimeFormat(locale, {
      month: 'long',
      day: 'numeric',
      ...(sameYear ? {} : { year: 'numeric' }),
    }).format(date);
  } catch {
    return date.toDateString();
  }
}

/** Entries must already be newest first, as the inbox query returns them. */
export function toInboxRows(
  items: readonly NotificationItem[],
  now: Date = new Date(),
  locale?: string,
): InboxRow[] {
  const rows: InboxRow[] = [];
  let currentDay: string | null = null;
  for (const item of items) {
    const created = new Date(item.created_at);
    const valid = Number.isFinite(created.getTime());
    const key = valid ? dayKey(created) : 'unknown';
    if (key !== currentDay) {
      currentDay = key;
      rows.push({
        type: 'header',
        key: `day:${key}`,
        title: valid ? dayTitle(created, now, locale) : 'Earlier',
      });
    }
    rows.push({ type: 'item', key: item.id, item });
  }
  return rows;
}
