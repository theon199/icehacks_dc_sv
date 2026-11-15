import {
  cookSessionFromUrl,
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

describe('cookSessionFromUrl', () => {
  it('reads and decodes the recipe id of a cook mode link', () => {
    expect(cookSessionFromUrl('/cook/mealdb%3A1')).toEqual({ id: 'mealdb:1', screen: 'cook' });
    expect(cookSessionFromUrl('/cook/plain-id/')).toEqual({ id: 'plain-id', screen: 'cook' });
  });

  it('reads a cooking coach link', () => {
    expect(cookSessionFromUrl('/cook/mealdb%3A1/coach')).toEqual({
      id: 'mealdb:1',
      screen: 'coach',
    });
    expect(cookSessionFromUrl('/cook/plain-id/coach/')).toEqual({
      id: 'plain-id',
      screen: 'coach',
    });
  });

  it('rejects other routes and malformed escapes', () => {
    expect(cookSessionFromUrl('/cook/mealdb%3A1/done')).toBeNull();
    expect(cookSessionFromUrl('/cook/mealdb%3A1/coach/x')).toBeNull();
    expect(cookSessionFromUrl('/cook/mealdb%3A1/coaching')).toBeNull();
    expect(cookSessionFromUrl('/recipe/mealdb%3A1')).toBeNull();
    expect(cookSessionFromUrl('/cook/%E0%A4%A')).toBeNull();
    expect(cookSessionFromUrl('/cook/%E0%A4%A/coach')).toBeNull();
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

  it("reports a session hidden behind another recipe's session", () => {
    const state = appStack(
      route('(tabs)'),
      route('cook/[id]/index', 'mealdb:1'),
      route('cook/[id]/index', 'mealdb:2'),
      route('recipe/[id]', 'mealdb:9'),
    );
    expect(findCookSession(state, 'mealdb:1')).toBe('behindAnotherSession');
    expect(findCookSession(state, 'mealdb:2')).toBe('underneath');
  });

  it("ignores another recipe's session further down than the nearest one", () => {
    const state = appStack(
      route('cook/[id]/index', 'mealdb:2'),
      route('cook/[id]/done', 'mealdb:2'),
      route('cook/[id]/index', 'mealdb:1'),
      route('compose'),
    );
    expect(findCookSession(state, 'mealdb:1')).toBe('underneath');
  });

  it("does not go back past another recipe's session on screen", () => {
    const state = appStack(
      route('index'),
      route('cook/[id]/index', 'mealdb:1'),
      route('cook/[id]/index', 'mealdb:2'),
    );
    expect(findCookSession(state, 'mealdb:1')).toBe('behindAnotherSession');
  });

  it("does not go back past another recipe's finish screen on screen", () => {
    const state = appStack(
      route('index'),
      route('cook/[id]/index', 'mealdb:1'),
      route('cook/[id]/done', 'mealdb:2'),
    );
    expect(findCookSession(state, 'mealdb:1')).toBe('behindAnotherSession');
  });

  it("does not go back past another recipe's finish screen in between", () => {
    const state = appStack(
      route('index'),
      route('cook/[id]/index', 'mealdb:1'),
      route('cook/[id]/done', 'mealdb:2'),
      route('recipe/[id]', 'mealdb:9'),
    );
    expect(findCookSession(state, 'mealdb:1')).toBe('behindAnotherSession');
  });

  it('does not go back past a finish screen of the same recipe', () => {
    const state = appStack(
      route('cook/[id]/index', 'mealdb:1'),
      route('cook/[id]/done', 'mealdb:1'),
      route('recipe/[id]', 'mealdb:9'),
    );
    expect(findCookSession(state, 'mealdb:1')).toBe('behindAnotherSession');
  });

  it("reports nothing open when another recipe's finish screen is the only cook screen", () => {
    expect(
      findCookSession(appStack(route('index'), route('cook/[id]/done', 'mealdb:2')), 'mealdb:1'),
    ).toBe('absent');
  });

  it('counts a cook screen in an inner navigator as nearer than the outer stack', () => {
    const state: NavStateLike = {
      index: 1,
      routes: [
        route('cook/[id]/index', 'mealdb:1'),
        {
          name: '(app)',
          state: {
            index: 1,
            routes: [route('cook/[id]/index', 'mealdb:2'), route('recipe/[id]', 'mealdb:9')],
          },
        },
      ],
    };
    expect(findCookSession(state, 'mealdb:1')).toBe('behindAnotherSession');
    expect(findCookSession(state, 'mealdb:2')).toBe('underneath');
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

  it('finds the coach for a coach timer, and treats cook mode as another cook screen', () => {
    const coach = route('cook/[id]/coach', 'mealdb:1');
    expect(findCookSession(appStack(route('(tabs)'), coach), 'mealdb:1', 'coach')).toBe('onScreen');
    expect(
      findCookSession(appStack(coach, route('recipe/[id]', 'mealdb:9')), 'mealdb:1', 'coach'),
    ).toBe('underneath');
    expect(
      findCookSession(appStack(coach, route('cook/[id]/index', 'mealdb:2')), 'mealdb:1', 'coach'),
    ).toBe('behindAnotherSession');
    expect(findCookSession(appStack(coach), 'mealdb:1')).toBe('absent');
    expect(
      findCookSession(appStack(route('cook/[id]/done', 'mealdb:1')), 'mealdb:1', 'coach'),
    ).toBe('onScreen');
  });
});
