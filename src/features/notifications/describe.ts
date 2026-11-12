/**
 * What an inbox entry says and where tapping it goes. Shared by the inbox rows and by tapped push
 * notifications so both always open the same screen.
 */
import type { Href } from 'expo-router';

import type { IconName } from '@/ui';

import { dataString, type NotificationItem } from './model';

export interface NotificationTargetInput {
  kind: NotificationItem['kind'];
  actor_id: string | null;
  post_id: string | null;
  comment_id: string | null;
  /** Moderation decision the entry is about, for `moderation` and `appeal_decision`. */
  action_id: string | null;
}

const ICONS: Record<NotificationItem['kind'], IconName> = {
  like: 'heart.fill',
  comment: 'bubble.left.fill',
  reply: 'arrowshape.turn.up.left.fill',
  follow: 'person.badge.plus',
  friend_accept: 'person.2.fill',
  moderation: 'exclamationmark.shield.fill',
  appeal_decision: 'checkmark.shield.fill',
  badge: 'rosette',
};

export function iconFor(kind: NotificationItem['kind']): IconName {
  return ICONS[kind];
}

/** The routing fields of an inbox row. */
export function targetInputOf(item: NotificationItem): NotificationTargetInput {
  return {
    kind: item.kind,
    actor_id: item.actor_id,
    post_id: item.post_id,
    comment_id: item.comment_id,
    action_id: dataString(item, 'action_id'),
  };
}

/** Screen to open for an entry, or null when what it pointed at no longer exists. */
export function notificationTarget(input: NotificationTargetInput): Href | null {
  switch (input.kind) {
    case 'like':
      return input.post_id ? { pathname: '/post/[id]', params: { id: input.post_id } } : null;
    case 'comment':
    case 'reply':
      if (!input.post_id) return null;
      return {
        pathname: '/post/[id]',
        params: input.comment_id
          ? { id: input.post_id, comment: input.comment_id }
          : { id: input.post_id },
      };
    case 'follow':
    case 'friend_accept':
      return input.actor_id ? { pathname: '/author/[id]', params: { id: input.actor_id } } : null;
    case 'moderation':
    case 'appeal_decision':
      return input.action_id
        ? { pathname: '/moderation/notice/[id]', params: { id: input.action_id } }
        : null;
    case 'badge':
      return '/profile';
  }
}

function contentNoun(targetKind: string | null): string {
  if (targetKind === 'comment') return 'comment';
  if (targetKind === 'recipe') return 'recipe';
  if (targetKind === 'user') return 'profile';
  return 'post';
}

function moderationText(item: NotificationItem): string {
  const noun = contentNoun(dataString(item, 'target_kind'));
  switch (dataString(item, 'action')) {
    case 'hide':
      return `Your ${noun} is hidden while we take a closer look.`;
    case 'remove':
      return `Your ${noun} was taken down for breaking community guidelines.`;
    case 'restore':
      return `Your ${noun} is visible again.`;
    case 'warn':
      return 'You received a warning about community guidelines.';
    case 'suspend':
      return 'Posting and commenting are paused on your account for now.';
    case 'unsuspend':
      return 'You can post and comment again.';
    default:
      return 'There is an update about your account.';
  }
}

/** Badge display names by badge id, as stored in `public.badges`. */
export type BadgeNames = ReadonlyMap<string, string>;

/**
 * One-line description, with the actor's name first when there is one. Badge entries are named
 * from `badgeNames` (loaded from `public.badges`); without a name the text stays generic.
 */
export function notificationText(item: NotificationItem, badgeNames?: BadgeNames): string {
  const actor = item.actor_display_name?.trim() || 'Someone';
  switch (item.kind) {
    case 'like':
      return `${actor} liked your post.`;
    case 'comment':
      return `${actor} commented on your post.`;
    case 'reply':
      return `${actor} replied to your comment.`;
    case 'follow':
      return `${actor} started following you.`;
    case 'friend_accept':
      return `${actor} accepted your invite. You're friends now.`;
    case 'moderation':
      return moderationText(item);
    case 'appeal_decision':
      return dataString(item, 'outcome') === 'reversed'
        ? 'Your appeal was accepted and the decision reversed.'
        : 'Your appeal was reviewed. The decision stands.';
    case 'badge': {
      const name = badgeNames?.get(dataString(item, 'badge_id') ?? '');
      return name ? `New badge: ${name}.` : 'You earned a new badge.';
    }
  }
}
