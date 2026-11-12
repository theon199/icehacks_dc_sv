/**
 * Reads the routing fields the push function puts in each message's `data` and decides where a
 * tap should go. Payloads are untrusted input: anything malformed simply opens the inbox.
 */
import type { Href } from 'expo-router';
import { z } from 'zod';

import { notificationTarget } from '../describe';
import { NOTIFICATION_KINDS } from '../model';

const optionalId = z.string().min(1).max(128).nullish().catch(null);

export const PushDataSchema = z.object({
  notification_id: z.string().min(1).max(128),
  recipient_id: z.string().min(1).max(128),
  kind: z.enum(NOTIFICATION_KINDS),
  actor_id: optionalId,
  post_id: optionalId,
  comment_id: optionalId,
  action_id: optionalId,
});

export type PushData = z.infer<typeof PushDataSchema>;

export function parsePushData(data: unknown): PushData | null {
  const parsed = PushDataSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export interface PushTap {
  /** Where to navigate. */
  href: Href;
  /** Inbox entry to mark read, when the push belongs to the signed-in account. */
  notificationId: string | null;
}

/**
 * Destination for a tapped push. A push meant for another account (the device changed hands
 * without signing out) opens the inbox and marks nothing read.
 */
export function resolvePushTap(data: unknown, currentUserId: string | null): PushTap {
  const parsed = parsePushData(data);
  if (!parsed || !currentUserId || parsed.recipient_id !== currentUserId) {
    return { href: '/notifications', notificationId: null };
  }
  const href =
    notificationTarget({
      kind: parsed.kind,
      actor_id: parsed.actor_id ?? null,
      post_id: parsed.post_id ?? null,
      comment_id: parsed.comment_id ?? null,
      action_id: parsed.action_id ?? null,
    }) ?? '/notifications';
  return { href, notificationId: parsed.notification_id };
}
