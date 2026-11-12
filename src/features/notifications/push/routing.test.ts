import { isCurrentPath, parsePushData, resolvePushTap } from './routing';

const data = {
  notification_id: 'n-1',
  recipient_id: 'user-1',
  kind: 'comment',
  actor_id: 'actor-1',
  post_id: 'post-1',
  comment_id: 'comment-1',
  action_id: null,
};

describe('resolvePushTap', () => {
  it('opens the target and marks the entry read for the signed-in recipient', () => {
    expect(resolvePushTap(data, 'user-1')).toEqual({
      href: { pathname: '/post/[id]', params: { id: 'post-1', comment: 'comment-1' } },
      notificationId: 'n-1',
    });
  });

  it('opens the inbox for a push meant for another account', () => {
    expect(resolvePushTap(data, 'user-2')).toEqual({
      href: '/notifications',
      notificationId: null,
    });
    expect(resolvePushTap(data, null)).toEqual({ href: '/notifications', notificationId: null });
  });

  it('opens the inbox for malformed payloads', () => {
    expect(resolvePushTap({ kind: 'party' }, 'user-1').href).toBe('/notifications');
    expect(resolvePushTap(undefined, 'user-1').href).toBe('/notifications');
  });

  it('falls back to the inbox when the target is gone', () => {
    expect(resolvePushTap({ ...data, post_id: null }, 'user-1')).toEqual({
      href: '/notifications',
      notificationId: 'n-1',
    });
  });
});

describe('parsePushData', () => {
  it('ignores oversized optional ids instead of rejecting the payload', () => {
    const parsed = parsePushData({ ...data, actor_id: 'x'.repeat(500) });
    expect(parsed?.actor_id).toBeNull();
  });
});

describe('isCurrentPath', () => {
  it('matches the same route whether or not its id is escaped', () => {
    expect(isCurrentPath('/cook/mealdb:1', '/cook/mealdb%3A1')).toBe(true);
    expect(isCurrentPath('/cook/mealdb%3A1', '/cook/mealdb%3A1')).toBe(true);
    expect(isCurrentPath('/cook/mealdb:1/', '/cook/mealdb%3A1')).toBe(true);
  });

  it('tells different routes apart', () => {
    expect(isCurrentPath('/cook/mealdb:1/done', '/cook/mealdb%3A1')).toBe(false);
    expect(isCurrentPath('/cook/mealdb:2', '/cook/mealdb%3A1')).toBe(false);
    expect(isCurrentPath(null, '/cook/mealdb%3A1')).toBe(false);
  });

  it('copes with a malformed escape', () => {
    expect(isCurrentPath('/cook/%E0%A4%A', '/cook/%E0%A4%A')).toBe(true);
  });
});
