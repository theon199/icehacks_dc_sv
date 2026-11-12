/**
 * Tap routing in the notification bridge: inbox pushes open their target, and a finished cook
 * timer's local alert returns to the cook session without stacking a second copy of it.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useSessionStore } from '@/features/auth';

import { NotificationBridge } from './NotificationBridge';

type Listener = (response: unknown) => void;

const mockRouter = { push: jest.fn() };
let mockPathname = '/';
let mockLaunch: unknown = null;
let mockTapListener: Listener | null = null;
const mockMarkRead = jest.fn((_ids: string[]) => Promise.resolve());

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPathname,
}));
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

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderBridge() {
  return render(<NotificationBridge />, { wrapper: Providers });
}

const initial = useSessionStore.getState();

beforeEach(() => {
  useSessionStore.setState(initial, true);
  useSessionStore.getState().signedIn({
    userId: USER,
    birthYear: new Date().getFullYear() - 30,
    onboardingComplete: true,
  });
  mockPathname = '/';
  mockLaunch = null;
  mockTapListener = null;
});

describe('NotificationBridge tap routing', () => {
  it('returns to the cook session when a cook timer alert is tapped', async () => {
    await renderBridge();
    await act(async () => mockTapListener?.(cookTimerTap()));
    expect(mockRouter.push).toHaveBeenCalledWith(COOK_URL);
    expect(mockMarkRead).not.toHaveBeenCalled();
  });

  it('opens the cook session when a cook timer alert launched the app', async () => {
    mockLaunch = cookTimerTap();
    await renderBridge();
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith(COOK_URL);
  });

  it.each([
    ['as the router reports it', '/cook/mealdb:1'],
    ['escaped', COOK_URL],
  ])('stays put when the cook session is already on screen (%s)', async (_how, pathname) => {
    mockPathname = pathname;
    await renderBridge();
    await act(async () => mockTapListener?.(cookTimerTap()));
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('opens a cook session for another recipe from a cook screen', async () => {
    mockPathname = '/cook/mealdb:2';
    await renderBridge();
    await act(async () => mockTapListener?.(cookTimerTap()));
    expect(mockRouter.push).toHaveBeenCalledWith(COOK_URL);
  });

  it('does not treat a lookalike payload as a cook timer', async () => {
    await renderBridge();
    await act(async () =>
      mockTapListener?.(tapOf({ kind: 'cook_timer', url: 'https://example.com/cook/1' })),
    );
    expect(mockRouter.push).toHaveBeenCalledWith('/notifications');
  });

  it('still opens the target of an inbox push and marks it read', async () => {
    await renderBridge();
    await act(async () =>
      mockTapListener?.(
        tapOf({ notification_id: 'note-1', recipient_id: USER, kind: 'badge', actor_id: null }),
      ),
    );
    expect(mockRouter.push).toHaveBeenCalledWith('/profile');
    expect(mockMarkRead).toHaveBeenCalledWith(['note-1']);
  });

  it('routes the same tap only once', async () => {
    const tap = cookTimerTap();
    mockLaunch = tap;
    await renderBridge();
    await act(async () => mockTapListener?.(tap));
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
  });
});
