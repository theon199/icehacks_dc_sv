import { notificationTarget, notificationText, targetInputOf } from './describe';
import type { NotificationItem } from './model';

function item(overrides: Partial<NotificationItem>): NotificationItem {
  return {
    id: 'n1',
    kind: 'like',
    actor_id: 'actor-1',
    actor_handle: 'ana',
    actor_display_name: 'Ana',
    actor_avatar_path: null,
    post_id: 'post-1',
    comment_id: null,
    data: {},
    read_at: null,
    created_at: '2026-11-10T10:00:00.000Z',
    ...overrides,
  };
}

describe('notificationTarget', () => {
  it('opens the post for likes and the exact comment for comments and replies', () => {
    expect(notificationTarget(targetInputOf(item({})))).toEqual({
      pathname: '/post/[id]',
      params: { id: 'post-1' },
    });
    expect(notificationTarget(targetInputOf(item({ kind: 'reply', comment_id: 'c-1' })))).toEqual({
      pathname: '/post/[id]',
      params: { id: 'post-1', comment: 'c-1' },
    });
  });

  it('opens the actor for follows and friend accepts', () => {
    expect(notificationTarget(targetInputOf(item({ kind: 'follow', post_id: null })))).toEqual({
      pathname: '/author/[id]',
      params: { id: 'actor-1' },
    });
  });

  it('opens the decision notice for moderation outcomes and appeal decisions', () => {
    const notice = { pathname: '/moderation/notice/[id]', params: { id: 'act-1' } };
    expect(
      notificationTarget(targetInputOf(item({ kind: 'moderation', data: { action_id: 'act-1' } }))),
    ).toEqual(notice);
    expect(
      notificationTarget(
        targetInputOf(item({ kind: 'appeal_decision', data: { action_id: 'act-1' } })),
      ),
    ).toEqual(notice);
  });

  it('returns null when the target is gone', () => {
    expect(notificationTarget(targetInputOf(item({ post_id: null })))).toBeNull();
    expect(notificationTarget(targetInputOf(item({ kind: 'moderation', data: {} })))).toBeNull();
  });

  it('opens the profile for badges', () => {
    expect(notificationTarget(targetInputOf(item({ kind: 'badge' })))).toBe('/profile');
  });
});

describe('notificationText', () => {
  it('leads with the actor and falls back when the name is missing', () => {
    expect(notificationText(item({}))).toBe('Ana liked your post.');
    expect(notificationText(item({ kind: 'follow', actor_display_name: '  ' }))).toBe(
      'Someone started following you.',
    );
  });

  it('describes moderation outcomes without the moderator', () => {
    expect(
      notificationText(
        item({ kind: 'moderation', data: { action: 'hide', target_kind: 'comment' } }),
      ),
    ).toBe('Your comment is hidden while we take a closer look.');
    expect(
      notificationText(item({ kind: 'appeal_decision', data: { outcome: 'reversed' } })),
    ).toContain('accepted');
  });

  it('names known badges', () => {
    expect(notificationText(item({ kind: 'badge', data: { badge_id: 'streak_7' } }))).toBe(
      'New badge: Seven-day streak.',
    );
  });
});
