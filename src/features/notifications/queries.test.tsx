import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useSessionStore } from '@/features/auth';

import type { NotificationItem } from './model';
import { applyReadLocally, notificationKeys, useMarkRead, useUnreadCount } from './queries';

const mockRpc = jest.fn();
jest.mock('@/lib/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

const initialSession = useSessionStore.getState();

function signIn(userId = 'user-1') {
  useSessionStore.setState({
    status: 'ready',
    userId,
    birthYear: 1990,
    onboardingComplete: true,
  });
}

const clients: QueryClient[] = [];

afterEach(async () => {
  // Unmount first so clearing the caches cannot notify (or keep polling for) live observers.
  await cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

function setup() {
  // Finished mutations keep a garbage-collection timer that clear() does not cancel; without
  // one, no timer outlives the test.
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

function item(id: string, readAt: string | null = null): NotificationItem {
  return {
    id,
    kind: 'like',
    actor_id: 'actor',
    actor_handle: 'ana',
    actor_display_name: 'Ana',
    actor_avatar_path: null,
    post_id: 'post',
    comment_id: null,
    data: {},
    read_at: readAt,
    created_at: '2026-11-10T10:00:00.000Z',
  };
}

beforeEach(() => {
  useSessionStore.setState(initialSession, true);
  mockRpc.mockReset();
});

describe('useUnreadCount', () => {
  it('returns the server count for the signed-in member', async () => {
    signIn();
    mockRpc.mockResolvedValue({ data: 4, error: null });
    const { wrapper } = setup();
    const { result } = await renderHook(() => useUnreadCount(), { wrapper });
    await waitFor(() => expect(result.current).toBe(4));
    expect(mockRpc).toHaveBeenCalledWith('unread_notification_count', {});
  });

  it('is 0 and asks nothing while signed out', async () => {
    useSessionStore.setState({ status: 'signedOut', userId: null });
    const { wrapper } = setup();
    const { result } = await renderHook(() => useUnreadCount(), { wrapper });
    expect(result.current).toBe(0);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('stays at 0 when the request fails or returns something unexpected', async () => {
    signIn();
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'PT401', message: 'x' } });
    const first = setup();
    const failed = await renderHook(() => useUnreadCount(), { wrapper: first.wrapper });
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1));
    expect(failed.result.current).toBe(0);

    mockRpc.mockResolvedValueOnce({ data: -3, error: null });
    const second = setup();
    const invalid = await renderHook(() => useUnreadCount(), { wrapper: second.wrapper });
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(2));
    expect(invalid.result.current).toBe(0);
  });
});

describe('useMarkRead', () => {
  function seed(client: QueryClient, unread: number, items: NotificationItem[]) {
    client.setQueryData(notificationKeys.unread('user-1'), unread);
    client.setQueryData(notificationKeys.inbox('user-1'), {
      pages: [{ items, next: null }],
      pageParams: [null],
    });
  }

  it('marks one entry read optimistically and lowers the badge', async () => {
    signIn();
    let resolve: (value: unknown) => void = () => undefined;
    mockRpc.mockReturnValue(new Promise((r) => (resolve = r)));
    const { client, wrapper } = setup();
    seed(client, 2, [item('a'), item('b')]);

    const { result } = await renderHook(() => useMarkRead(), { wrapper });
    await act(async () => {
      result.current.mutate(['a']);
    });
    await waitFor(() => expect(client.getQueryData(notificationKeys.unread('user-1'))).toBe(1));
    expect(mockRpc).toHaveBeenCalledWith('mark_notifications_read', { p_ids: ['a'] });

    await act(async () => resolve({ data: 1, error: null }));
  });

  it('restores the previous state when the server refuses', async () => {
    signIn();
    mockRpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'invalid_input' } });
    const { client, wrapper } = setup();
    seed(client, 1, [item('a')]);

    const { result } = await renderHook(() => useMarkRead(), { wrapper });
    await act(async () => {
      result.current.mutate(undefined);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockRpc).toHaveBeenCalledWith('mark_notifications_read', {});
    expect(client.getQueryData(notificationKeys.unread('user-1'))).toBe(1);
  });
});

describe('applyReadLocally', () => {
  const data = {
    pages: [{ items: [item('a'), item('b', 'earlier')], next: null }],
    pageParams: [null],
  };

  it('marks only the given unread entries', () => {
    const next = applyReadLocally(data, new Set(['a']), 'now');
    expect(next?.pages[0]?.items.map((i) => i.read_at)).toEqual(['now', 'earlier']);
  });

  it('marks every unread entry when no ids are given and keeps earlier read times', () => {
    const next = applyReadLocally(data, undefined, 'now');
    expect(next?.pages[0]?.items.map((i) => i.read_at)).toEqual(['now', 'earlier']);
  });
});
