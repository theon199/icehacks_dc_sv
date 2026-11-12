import {
  cookSessionIdFromUrl,
  findCookSession,
  parsePushData,
  resolvePushTap,
  type NavStateLike,
} from './routing';

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

describe('cookSessionIdFromUrl', () => {
  it('reads and decodes the recipe id', () => {
    expect(cookSessionIdFromUrl('/cook/mealdb%3A1')).toBe('mealdb:1');
    expect(cookSessionIdFromUrl('/cook/plain-id/')).toBe('plain-id');
  });

  it('rejects other routes and malformed escapes', () => {
    expect(cookSessionIdFromUrl('/cook/mealdb%3A1/done')).toBeNull();
    expect(cookSessionIdFromUrl('/recipe/mealdb%3A1')).toBeNull();
    expect(cookSessionIdFromUrl('/cook/%E0%A4%A')).toBeNull();
  });
});

describe('findCookSession', () => {
  const route = (name: string, id?: string) => (id ? { name, params: { id } } : { name });
  /** The signed-in app's stack under the root, the way expo-router nests it. */
  const appStack = (...routes: ReturnType<typeof route>[]): NavStateLike => ({
    index: 0,
    routes: [{ name: '(app)', state: { index: routes.length - 1, routes } }],
  });

  it('sees the session or its finish screen on screen', () => {
    const tabs = route('(tabs)');
    expect(findCookSession(appStack(tabs, route('cook/[id]/index', 'mealdb:1')), 'mealdb:1')).toBe(
      'onScreen',
    );
    expect(findCookSession(appStack(tabs, route('cook/[id]/done', 'mealdb:1')), 'mealdb:1')).toBe(
      'onScreen',
    );
  });

  it('matches an id kept escaped in the params', () => {
    const state = appStack(route('cook/[id]/index', 'mealdb%3A1'));
    expect(findCookSession(state, 'mealdb:1')).toBe('onScreen');
  });

  it('finds the session under other screens', () => {
    const state = appStack(
      route('(tabs)'),
      route('cook/[id]/index', 'mealdb:1'),
      route('recipe/[id]', 'mealdb:9'),
    );
    expect(findCookSession(state, 'mealdb:1')).toBe('underneath');
  });

  it('does not count a finish screen underneath as an open session', () => {
    const state = appStack(route('cook/[id]/done', 'mealdb:1'), route('compose'));
    expect(findCookSession(state, 'mealdb:1')).toBe('absent');
  });

  it('tells sessions for other recipes apart', () => {
    const state = appStack(route('(tabs)'), route('cook/[id]/index', 'mealdb:2'));
    expect(findCookSession(state, 'mealdb:1')).toBe('absent');
  });

  it('treats a partial state as focused on its last route', () => {
    const state: NavStateLike = { routes: [route('index'), route('cook/[id]/index', 'mealdb:1')] };
    expect(findCookSession(state, 'mealdb:1')).toBe('onScreen');
  });

  it('copes with no state yet', () => {
    expect(findCookSession(undefined, 'mealdb:1')).toBe('absent');
    expect(findCookSession({ routes: [] }, 'mealdb:1')).toBe('absent');
  });
});
