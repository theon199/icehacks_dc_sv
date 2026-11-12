/** React Query hooks for the inbox and the bell badge. */
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';

import { useSessionStore } from '@/features/auth';

import { fetchInboxPage, fetchUnreadCount, markNotificationsRead } from './api';
import type { NotificationPage } from './model';

export const notificationKeys = {
  all: ['notifications'] as const,
  inbox: (userId: string | null) => ['notifications', 'inbox', userId] as const,
  unread: (userId: string | null) => ['notifications', 'unread', userId] as const,
};

/** The signed-in user id once the app is unlocked, otherwise null (queries stay idle). */
function useReadyUserId(): string | null {
  return useSessionStore((s) => (s.status === 'ready' ? s.userId : null));
}

const UNREAD_REFRESH_MS = 60_000;

/**
 * Unread inbox entries for the bell badge. 0 while signed out or loading, so headers can render it
 * unconditionally. Refreshes every minute while the app is in the foreground and whenever a push
 * or realtime event invalidates it.
 */
export function useUnreadCount(): number {
  const userId = useReadyUserId();
  const { data } = useQuery({
    queryKey: notificationKeys.unread(userId),
    queryFn: fetchUnreadCount,
    enabled: userId != null,
    staleTime: 30_000,
    refetchInterval: UNREAD_REFRESH_MS,
  });
  return userId == null ? 0 : (data ?? 0);
}

export function useInbox() {
  const userId = useReadyUserId();
  return useInfiniteQuery({
    queryKey: notificationKeys.inbox(userId),
    queryFn: ({ pageParam }) => fetchInboxPage(pageParam),
    initialPageParam: null as NotificationPage['next'],
    getNextPageParam: (last) => last.next,
    enabled: userId != null,
    staleTime: 15_000,
  });
}

type InboxData = InfiniteData<NotificationPage, NotificationPage['next']>;

/** Marks entries read in every cached inbox page; `ids` undefined means all of them. */
export function applyReadLocally(
  data: InboxData | undefined,
  ids: ReadonlySet<string> | undefined,
  readAt: string,
): InboxData | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) =>
        item.read_at == null && (!ids || ids.has(item.id)) ? { ...item, read_at: readAt } : item,
      ),
    })),
  };
}

function countUnreadAmong(data: InboxData | undefined, ids: ReadonlySet<string>): number {
  if (!data) return 0;
  let count = 0;
  for (const page of data.pages) {
    for (const item of page.items) if (item.read_at == null && ids.has(item.id)) count += 1;
  }
  return count;
}

/** Refreshes the badge and the inbox, e.g. after a push or realtime insert. */
export function invalidateInbox(client: QueryClient): Promise<void> {
  return client.invalidateQueries({ queryKey: notificationKeys.all });
}

/**
 * Marks entries read with an optimistic update of the inbox and the badge. Pass no ids to mark
 * everything read.
 */
export function useMarkRead() {
  const client = useQueryClient();
  const userId = useReadyUserId();
  return useMutation({
    mutationFn: (ids: readonly string[] | undefined) => markNotificationsRead(ids),
    onMutate: async (ids) => {
      const inboxKey = notificationKeys.inbox(userId);
      const unreadKey = notificationKeys.unread(userId);
      await Promise.all([
        client.cancelQueries({ queryKey: inboxKey }),
        client.cancelQueries({ queryKey: unreadKey }),
      ]);
      const previousInbox = client.getQueryData<InboxData>(inboxKey);
      const previousUnread = client.getQueryData<number>(unreadKey);
      const idSet = ids ? new Set(ids) : undefined;
      const newlyRead = idSet ? countUnreadAmong(previousInbox, idSet) : (previousUnread ?? 0);
      client.setQueryData<InboxData>(inboxKey, (data) =>
        applyReadLocally(data, idSet, new Date().toISOString()),
      );
      if (previousUnread !== undefined) {
        client.setQueryData<number>(unreadKey, Math.max(0, previousUnread - newlyRead));
      }
      return { previousInbox, previousUnread };
    },
    onError: (_error, _ids, context) => {
      if (!context) return;
      client.setQueryData(notificationKeys.inbox(userId), context.previousInbox);
      client.setQueryData(notificationKeys.unread(userId), context.previousUnread);
    },
    onSettled: () => client.invalidateQueries({ queryKey: notificationKeys.unread(userId) }),
  });
}
