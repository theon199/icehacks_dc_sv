/** Inbox reads and writes. Reads go through RLS on `notification_cards`; writes through RPCs. */
import { z } from 'zod';

import { supabase } from '@/lib/supabase/client';

import { NOTIFICATION_COLUMNS, NotificationItemSchema, type NotificationPage } from './model';
import { callRpc, parseResult, toApiError } from './rpc';

export const INBOX_PAGE_SIZE = 30;

/** Keyset filter for "older than (createdAt, id)", quoted so timestamps survive the parser. */
export function olderThanFilter(cursor: { createdAt: string; id: string }): string {
  const at = `"${cursor.createdAt}"`;
  return `created_at.lt.${at},and(created_at.eq.${at},id.lt.${cursor.id})`;
}

/** One page of the inbox, newest first. */
export async function fetchInboxPage(
  cursor: NotificationPage['next'],
  limit = INBOX_PAGE_SIZE,
): Promise<NotificationPage> {
  let query = supabase
    .from('notification_cards')
    .select(NOTIFICATION_COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (cursor) query = query.or(olderThanFilter(cursor));
  const { data, error } = await query;
  if (error) throw toApiError('notification_cards', error);
  const items = parseResult('notification_cards', z.array(NotificationItemSchema), data);
  const last = items[items.length - 1];
  return {
    items,
    next: items.length === limit && last ? { createdAt: last.created_at, id: last.id } : null,
  };
}

/** Badge names by id from `public.badges` (readable by every member). */
export async function fetchBadgeNames(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('badges').select('id, name');
  if (error) throw toApiError('badges', error);
  const rows = parseResult('badges', z.array(z.object({ id: z.string(), name: z.string() })), data);
  return new Map(rows.map((row) => [row.id, row.name]));
}

export function fetchUnreadCount(): Promise<number> {
  return callRpc('unread_notification_count', {}, z.number().int().nonnegative());
}

/** Marks the given entries (or every unread entry when `ids` is omitted) read. */
export function markNotificationsRead(ids?: readonly string[]): Promise<number> {
  return callRpc(
    'mark_notifications_read',
    ids ? { p_ids: [...ids] } : {},
    z.number().int().nonnegative(),
  );
}
