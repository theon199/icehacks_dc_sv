/**
 * Tap routing in the notification bridge, driven through the real router: inbox pushes open their
 * target, and a finished cook timer's local alert returns to the cook session without stacking a
 * second copy of it.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  router,
  Stack,
  useLocalSearchParams,
  useNavigationContainerRef,
  type Href,
} from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import { useEffect, type ComponentType, type ReactNode } from 'react';
import { Text } from 'react-native';

import { useSessionStore } from '@/features/auth';

import { NotificationBridge } from './NotificationBridge';
import type { NavStateLike } from './routing';

type Listener = (response: unknown) => void;

let mockLaunch: unknown = null;
let mockTapListener: Listener | null = null;
const mockMarkRead = jest.fn((_ids: string[]) => Promise.resolve());

jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponse: jest.fn(() => mockLaunch),
  clearLastNotificationResponse: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn((listener: Listener) => {
    mockTapListener = listener;
    return { remove: jest.fn() };
  }),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  setBadgeCountAsync: jest.fn(() => Promise.resolve(true)),
}));
jest.mock('@/lib/supabase/client', () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return { supabase: { channel: () => channel, removeChannel: jest.fn(() => Promise.resolve()) } };
});
jest.mock('../api', () => ({ markNotificationsRead: (ids: string[]) => mockMarkRead(ids) }));
jest.mock('../deps', () => ({ usePushEnabled: () => true }));
jest.mock('../queries', () => ({
  invalidateInbox: jest.fn(() => Promise.resolve()),
  useUnreadCount: () => 0,
}));
jest.mock('./pushDevice', () => ({ syncPushRegistration: jest.fn(() => Promise.resolve()) }));

const USER = 'person-1';
const COOK_URL = '/cook/mealdb%3A1';
let nextId = 0;

/** A tapped notification; ids are unique because the bridge remembers taps it has handled. */
function tapOf(data: Record<string, unknown>) {
  nextId += 1;
  return {
    actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
    notification: { request: { identifier: `n-${nextId}`, content: { data } } },
  };
}

const cookTimerTap = () => tapOf({ kind: 'cook_timer', url: COOK_URL });

function label(text: string) {
  return function StandIn() {
    return <Text>{text}</Text>;
  };
}

function withId(prefix: string) {
  return function StandIn() {
    const { id } = useLocalSearchParams<{ id: string }>();
    return <Text>{`${prefix} ${id}`}</Text>;
  };
}

/** The root navigation, read by the assertions to see exactly which screens are stacked. */
let rootNavigation: ReturnType<typeof useNavigationContainerRef> | null = null;

function BridgeLayout() {
  const navigation = useNavigationContainerRef();
  useEffect(() => {
    rootNavigation = navigation;
  }, [navigation]);
  return (
    <>
      <NotificationBridge />
      <Stack />
    </>
  );
}

const routes: Record<string, ComponentType> = {
  _layout: BridgeLayout,
  index: label('home'),
  'cook/[id]/index': withId('cooking'),
  'cook/[id]/done': withId('finished'),
  'recipe/[id]': withId('recipe'),
  notifications: label('inbox'),
  profile: label('profile'),
};

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Renders the app at `initialUrl` with `history` screens pushed on top, then lets effects run. */
async function renderAt(initialUrl: string, ...history: string[]) {
  await renderRouter(routes, { initialUrl, wrapper: Providers });
  for (const path of history) {
    await act(async () => router.push(path as Href));
  }
}

/** Route names in the innermost stack showing the focused screen, bottom to top. */
function stackNames(): string[] {
  let state = rootNavigation?.getRootState() as NavStateLike | undefined;
  while (state) {
    const focused = state.routes[state.index ?? state.routes.length - 1];
    if (!focused?.state) return state.routes.map((route) => route.name);
    state = focused.state;
  }
  return [];
}

async function tap(response: unknown) {
  await act(async () => mockTapListener?.(response));
}

const initial = useSessionStore.getState();

beforeEach(() => {
  useSessionStore.setState(initial, true);
  useSessionStore.getState().signedIn({
    userId: USER,
    birthYear: new Date().getFullYear() - 30,
    onboardingComplete: true,
  });
  mockLaunch = null;
  mockTapListener = null;
  mockMarkRead.mockClear();
});

describe('NotificationBridge tap routing', () => {
  it('returns to the cook session when a cook timer alert is tapped', async () => {
    await renderAt('/');
    await tap(cookTimerTap());
    expect(await screen.findByText('cooking mealdb:1')).toBeOnTheScreen();
    expect(stackNames()).toEqual(['index', 'cook/[id]/index']);
    expect(mockMarkRead).not.toHaveBeenCalled();
  });

  it('opens the cook session when a cook timer alert launched the app', async () => {
    mockLaunch = cookTimerTap();
    await renderAt('/');
    expect(await screen.findByText('cooking mealdb:1')).toBeOnTheScreen();
    expect(stackNames()).toEqual(['index', 'cook/[id]/index']);
  });

  it.each([
    ['decoded', '/cook/mealdb:1'],
    ['escaped', COOK_URL],
  ])('stays put when the cook session is already on screen (%s link)', async (_how, url) => {
    await renderAt('/', url);
    const before = stackNames();
    await tap(cookTimerTap());
    expect(screen.getByText('cooking mealdb:1')).toBeOnTheScreen();
    expect(stackNames()).toEqual(before);
  });

  it('stays on the finish screen of the same session', async () => {
    await renderAt('/', '/cook/mealdb:1/done');
    const before = stackNames();
    await tap(cookTimerTap());
    expect(screen.getByText('finished mealdb:1')).toBeOnTheScreen();
    expect(stackNames()).toEqual(before);
  });

  it('goes back to a session further down the stack instead of opening a second one', async () => {
    await renderAt('/', COOK_URL, '/recipe/mealdb:9');
    expect(screen.getByText('recipe mealdb:9')).toBeOnTheScreen();
    await tap(cookTimerTap());
    expect(await screen.findByText('cooking mealdb:1')).toBeOnTheScreen();
    expect(stackNames()).toEqual(['index', 'cook/[id]/index']);
  });

  it('opens a cook session for another recipe from a cook screen', async () => {
    await renderAt('/', '/cook/mealdb:2');
    await tap(cookTimerTap());
    expect(await screen.findByText('cooking mealdb:1')).toBeOnTheScreen();
    expect(stackNames()).toEqual(['index', 'cook/[id]/index', 'cook/[id]/index']);
  });

  it('does not treat a lookalike payload as a cook timer', async () => {
    await renderAt('/');
    await tap(tapOf({ kind: 'cook_timer', url: 'https://example.com/cook/1' }));
    expect(await screen.findByText('inbox')).toBeOnTheScreen();
  });

  it('still opens the target of an inbox push and marks it read', async () => {
    await renderAt('/');
    await tap(
      tapOf({ notification_id: 'note-1', recipient_id: USER, kind: 'badge', actor_id: null }),
    );
    expect(await screen.findByText('profile')).toBeOnTheScreen();
    expect(mockMarkRead).toHaveBeenCalledWith(['note-1']);
  });

  it('routes the same tap only once', async () => {
    const launch = cookTimerTap();
    mockLaunch = launch;
    await renderAt('/');
    await tap(launch);
    expect(await screen.findByText('cooking mealdb:1')).toBeOnTheScreen();
    expect(stackNames()).toEqual(['index', 'cook/[id]/index']);
  });
});
