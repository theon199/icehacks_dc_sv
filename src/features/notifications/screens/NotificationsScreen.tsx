import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import {
  Button,
  EmptyState,
  ErrorState,
  Skeleton,
  SkeletonGroup,
  Text,
  toast,
  useTheme,
} from '@/ui';
import { gutter, space } from '@/ui/tokens';

import { NotificationRow } from '../components/NotificationRow';
import { PushOptInCard } from '../components/PushOptInCard';
import { notificationTarget, targetInputOf } from '../describe';
import type { NotificationItem } from '../model';
import { useBadgeNames, useInbox, useMarkRead, useUnreadCount } from '../queries';
import { toInboxRows, type InboxRow } from '../sections';

function InboxSkeleton() {
  return (
    <SkeletonGroup label="Loading notifications" style={styles.skeleton}>
      {[0, 1, 2, 3, 4].map((index) => (
        <View key={index} style={styles.skeletonRow}>
          <Skeleton width={44} height={44} radius="pill" />
          <View style={styles.skeletonText}>
            <Skeleton width="85%" />
            <Skeleton width="30%" height={12} />
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}

export function NotificationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const inbox = useInbox();
  const unread = useUnreadCount();
  const markRead = useMarkRead();
  // `mutate` is stable; the mutation object is not, and depending on it re-renders every row.
  const markReadMutate = markRead.mutate;
  const badgeNames = useBadgeNames();

  const items = useMemo(() => inbox.data?.pages.flatMap((page) => page.items) ?? [], [inbox.data]);
  // Relative times are measured from the last fetch, rounded to the minute: optimistic updates
  // also move dataUpdatedAt, and an unrounded value would re-render every row on each tap.
  const now = Math.floor(inbox.dataUpdatedAt / 60_000) * 60_000;
  const rows = useMemo(() => toInboxRows(items, new Date(now)), [items, now]);
  const hasUnreadLoaded = items.some((item) => item.read_at == null);

  const openItem = useCallback(
    (item: NotificationItem) => {
      if (item.read_at == null) markReadMutate([item.id]);
      const target = notificationTarget(targetInputOf(item));
      if (target) router.push(target);
      else toast.show({ message: 'That content is no longer available.' });
    },
    [markReadMutate, router],
  );

  const renderItem: ListRenderItem<InboxRow> = useCallback(
    ({ item: row }) =>
      row.type === 'header' ? (
        <Text variant="overline" tone="muted" style={styles.sectionTitle}>
          {row.title}
        </Text>
      ) : (
        <NotificationRow item={row.item} onPress={openItem} now={now} badgeNames={badgeNames} />
      ),
    [openItem, now, badgeNames],
  );

  const markAllButton =
    unread > 0 || hasUnreadLoaded ? (
      <Button
        label="Mark all read"
        size="sm"
        variant="ghost"
        haptic={false}
        onPress={() => markRead.mutate(undefined)}
        testID="mark-all-read"
      />
    ) : null;

  const header = <Stack.Screen options={{ headerRight: () => markAllButton }} />;

  if (inbox.isPending) {
    return (
      <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
        {header}
        <InboxSkeleton />
      </View>
    );
  }

  if (inbox.isError && items.length === 0) {
    return (
      <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
        {header}
        <ErrorState error={inbox.error} onRetry={() => void inbox.refetch()} />
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      {header}
      <FlashList
        data={rows}
        renderItem={renderItem}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.type}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={
          items.length > 0 ? (
            <View style={styles.listHeader}>
              <PushOptInCard moment="inbox_has_activity" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="bell"
            title="Nothing new yet"
            message="When people like, comment on or follow your cooking, you'll see it here."
          />
        }
        ListFooterComponent={
          inbox.isFetchingNextPage ? (
            <View style={styles.footer}>
              <Skeleton width="60%" />
            </View>
          ) : null
        }
        onEndReached={() => {
          if (inbox.hasNextPage && !inbox.isFetchingNextPage) void inbox.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={inbox.isRefetching && !inbox.isFetchingNextPage}
            onRefresh={() => void inbox.refetch()}
            tintColor={theme.colors.primary}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  skeleton: { padding: gutter, gap: space.lg },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  skeletonText: { flex: 1, gap: space.sm },
  sectionTitle: { paddingHorizontal: gutter, paddingTop: space.lg, paddingBottom: space.xs },
  listHeader: { paddingHorizontal: gutter, paddingTop: space.md },
  footer: { padding: gutter },
});
