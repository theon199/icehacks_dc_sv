import { z } from 'zod';

import type { NotificationKind } from '@/lib/supabase/database.types';

export const NOTIFICATION_KINDS = [
  'like',
  'comment',
  'reply',
  'follow',
  'friend_accept',
  'moderation',
  'appeal_decision',
  'badge',
] as const satisfies readonly NotificationKind[];

/** A row of the `notification_cards` view, as the inbox uses it. */
export const NotificationItemSchema = z.object({
  id: z.string(),
  kind: z.enum(NOTIFICATION_KINDS),
  actor_id: z.string().nullable(),
  actor_handle: z.string().nullable(),
  actor_display_name: z.string().nullable(),
  actor_avatar_path: z.string().nullable(),
  post_id: z.string().nullable(),
  comment_id: z.string().nullable(),
  data: z.record(z.string(), z.unknown()).catch({}),
  read_at: z.string().nullable(),
  created_at: z.string(),
});

export type NotificationItem = z.infer<typeof NotificationItemSchema>;

/** Columns selected from `notification_cards`; keep in step with the schema above. */
export const NOTIFICATION_COLUMNS =
  'id, kind, actor_id, actor_handle, actor_display_name, actor_avatar_path, post_id, comment_id, data, read_at, created_at';

export interface NotificationPage {
  items: NotificationItem[];
  /** Keyset cursor for the next (older) page, or null at the end. */
  next: { createdAt: string; id: string } | null;
}

/** Reads a string field from a notification's `data` payload. */
export function dataString(item: Pick<NotificationItem, 'data'>, key: string): string | null {
  const value = item.data[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
