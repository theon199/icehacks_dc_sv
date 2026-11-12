import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import {
  EmptyState,
  ErrorState,
  SegmentedControl,
  Skeleton,
  SkeletonGroup,
  useTheme,
  type Segment,
} from '@/ui';
import { gutter, space } from '@/ui/tokens';

import { AppealReviewCard } from '../components/AppealReviewCard';
import { AuditRow } from '../components/AuditRow';
import { ModeratorGate } from '../components/ModeratorGate';
import { QueueItemCard } from '../components/QueueItemCard';
import type { QueueItem } from '../model';
import { useAppealQueue, useAuditLog, useQueue } from '../queries';

type Tab = 'reports' | 'appeals' | 'history';

const TABS: readonly Segment<Tab>[] = [
  { value: 'reports', label: 'Reports' },
  { value: 'appeals', label: 'Appeals' },
  { value: 'history', label: 'History' },
];

function Loading() {
  return (
    <SkeletonGroup style={styles.padded}>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} height={120} radius="md" />
      ))}
    </SkeletonGroup>
  );
}

function ReportsTab() {
  const theme = useTheme();
  const router = useRouter();
  const queue = useQueue('open', true);
  const items = useMemo(() => queue.data?.pages.flatMap((p) => p.items) ?? [], [queue.data]);
  const now = queue.dataUpdatedAt;
  const open = useCallback(
    (item: QueueItem) =>
      router.push({
        pathname: '/moderation/review',
        params: { kind: item.target_kind, id: item.target_id },
      }),
    [router],
  );

  if (queue.isPending) return <Loading />;
  if (queue.isError) return <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />;
  return (
    <FlashList
      data={items}
      keyExtractor={(item) => `${item.target_kind}:${item.target_id}`}
      renderItem={({ item }) => <QueueItemCard item={item} now={now} onOpen={open} />}
      contentContainerStyle={styles.padded}
      ListEmptyComponent={
        <EmptyState icon="checkmark.seal" title="Queue is clear" message="No open reports." />
      }
      onEndReached={() => {
        if (queue.hasNextPage && !queue.isFetchingNextPage) void queue.fetchNextPage();
      }}
      refreshControl={
        <RefreshControl
          refreshing={queue.isRefetching && !queue.isFetchingNextPage}
          onRefresh={() => void queue.refetch()}
          tintColor={theme.colors.primary}
        />
      }
    />
  );
}

function AppealsTab() {
  const theme = useTheme();
  const appeals = useAppealQueue(true);
  const now = appeals.dataUpdatedAt;
  if (appeals.isPending) return <Loading />;
  if (appeals.isError) {
    return <ErrorState error={appeals.error} onRetry={() => void appeals.refetch()} />;
  }
  return (
    <FlashList
      data={appeals.data}
      keyExtractor={(appeal) => appeal.appeal_id}
      renderItem={({ item }) => (
        <View style={styles.cardGap}>
          <AppealReviewCard appeal={item} now={now} />
        </View>
      )}
      contentContainerStyle={styles.padded}
      ListEmptyComponent={
        <EmptyState icon="checkmark.seal" title="No pending appeals" message="All caught up." />
      }
      refreshControl={
        <RefreshControl
          refreshing={appeals.isRefetching}
          onRefresh={() => void appeals.refetch()}
          tintColor={theme.colors.primary}
        />
      }
    />
  );
}

function HistoryTab() {
  const theme = useTheme();
  const audit = useAuditLog(null, true);
  const entries = useMemo(() => audit.data?.pages.flatMap((p) => p.items) ?? [], [audit.data]);
  const now = audit.dataUpdatedAt;
  if (audit.isPending) return <Loading />;
  if (audit.isError) return <ErrorState error={audit.error} onRetry={() => void audit.refetch()} />;
  return (
    <FlashList
      data={entries}
      keyExtractor={(entry) => entry.id}
      renderItem={({ item }) => <AuditRow entry={item} now={now} />}
      contentContainerStyle={styles.padded}
      ListEmptyComponent={<EmptyState icon="clock" title="No decisions yet" />}
      onEndReached={() => {
        if (audit.hasNextPage && !audit.isFetchingNextPage) void audit.fetchNextPage();
      }}
      refreshControl={
        <RefreshControl
          refreshing={audit.isRefetching && !audit.isFetchingNextPage}
          onRefresh={() => void audit.refetch()}
          tintColor={theme.colors.primary}
        />
      }
    />
  );
}

function QueueTabs() {
  const theme = useTheme();
  const [tab, setTab] = useState<Tab>('reports');
  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <View style={styles.tabs}>
        <SegmentedControl
          segments={TABS}
          value={tab}
          onChange={setTab}
          accessibilityLabel="Review queue"
        />
      </View>
      <View style={styles.flex}>
        {tab === 'reports' ? <ReportsTab /> : tab === 'appeals' ? <AppealsTab /> : <HistoryTab />}
      </View>
    </View>
  );
}

/** Moderators: open reports grouped by target, pending appeals and the decision history. */
export function ModerationQueueScreen() {
  return (
    <ModeratorGate>
      <QueueTabs />
    </ModeratorGate>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabs: { paddingHorizontal: gutter, paddingVertical: space.md },
  padded: { paddingHorizontal: gutter, paddingBottom: space.xxxl },
  cardGap: { paddingBottom: space.md },
});
