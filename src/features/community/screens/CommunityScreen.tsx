import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { router, Stack } from 'expo-router';
import { useCallback, useState, type ReactElement } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';

import { defineKvKey } from '@/lib/storage/kv';
import { ErrorState, IconButton, SegmentedControl, gutter, space, useTheme } from '@/ui';

import { feedModeSchema, type FeedMode } from '../api/schemas';
import type { Post } from '../api/types';
import { FeedEmpty } from '../components/FeedEmpty';
import { PostCard } from '../components/PostCard';
import { PostSkeletonList } from '../components/PostSkeleton';
import { usePostMenu } from '../components/usePostMenu';
import { WeeklyTopDishes } from '../components/WeeklyTopDishes';
import { useFeed } from '../hooks/useFeed';

const SEGMENTS = [
  { value: 'following', label: 'Following' },
  { value: 'popular', label: 'Popular' },
  { value: 'new', label: 'New' },
] as const;

const lastMode = defineKvKey('community.feedMode', feedModeSchema);

function readLastMode(): FeedMode {
  try {
    return lastMode.getSync() ?? 'popular';
  } catch {
    return 'popular';
  }
}

const keyExtractor = (post: Post) => post.id;

/** The Community tab: Following, Popular and New feeds with this week's most-cooked dishes. */
export function CommunityScreen() {
  const theme = useTheme();
  const [mode, setMode] = useState<FeedMode>(readLastMode);
  const feed = useFeed(mode);
  const openMenu = usePostMenu();
  const [refreshing, setRefreshing] = useState(false);

  const changeMode = useCallback((next: FeedMode) => {
    setMode(next);
    try {
      lastMode.setSync(next);
    } catch {
      // Remembering the tab is a convenience only.
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await feed.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [feed]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;
  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Post>) => (
      <PostCard post={item} onMenu={openMenu} priority={index < 2 ? 'high' : 'normal'} />
    ),
    [openMenu],
  );

  const header = (
    <View style={styles.header}>
      <SegmentedControl
        segments={SEGMENTS}
        value={mode}
        onChange={changeMode}
        accessibilityLabel="Feed"
        testID="feed-mode"
      />
      <WeeklyTopDishes />
    </View>
  );

  let empty: ReactElement;
  if (feed.isPending) empty = <PostSkeletonList />;
  else if (feed.isError)
    empty = <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />;
  else empty = <FeedEmpty mode={mode} />;

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton
              icon="square.and.pencil"
              accessibilityLabel="Share a dish"
              color="primary"
              onPress={() => router.push('/compose')}
              testID="compose-button"
            />
          ),
        }}
      />
      <FlashList
        key={mode}
        data={feed.posts}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          feed.isFetchingNextPage ? (
            <ActivityIndicator style={styles.footer} color={theme.colors.primary} />
          ) : null
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
      />
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: gutter, paddingBottom: space.huge },
  header: { gap: space.lg, paddingTop: space.sm, paddingBottom: space.lg },
  separator: { height: space.lg },
  footer: { paddingVertical: space.xl },
});
