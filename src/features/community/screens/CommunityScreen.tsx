import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useState, type ReactElement } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { defineKvKey } from '@/lib/storage/kv';
import { ErrorState, Header, IconButton, SegmentedControl, gutter, space, useTheme } from '@/ui';

import { feedModeSchema, type FeedMode } from '../api/schemas';
import type { Post } from '../api/types';
import { FeedEmpty } from '../components/FeedEmpty';
import { PostCard } from '../components/PostCard';
import { PostSkeletonList } from '../components/PostSkeleton';
import { usePostMenu } from '../components/usePostMenu';
import { WeeklyTopDishes } from '../components/WeeklyTopDishes';
import { NotificationBell } from '../deps';
import { useForgetOtherViewers, useViewer } from '../hooks/queryKeys';
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
const openCompose = () => router.push('/compose');
const openProfile = () => router.push('/profile');

/** The Community tab: Following, Popular and New feeds with this week's most-cooked dishes. */
export function CommunityScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  useForgetOtherViewers(useViewer());
  const [mode, setMode] = useState<FeedMode>(readLastMode);
  const feed = useFeed(mode);
  const openMenu = usePostMenu();
  // Only a pull shows the spinner; background refetches stay quiet.
  const [isPulling, setIsPulling] = useState<boolean>(false);

  const changeMode = useCallback((next: FeedMode) => {
    setMode(next);
    try {
      lastMode.setSync(next);
    } catch {
      // Remembering the tab is a convenience only.
    }
  }, []);

  const { refetch } = feed;
  const onRefresh = useCallback(() => {
    setIsPulling(true);
    void refetch().finally(() => setIsPulling(false));
  }, [refetch]);

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
      <WeeklyTopDishes />
      <SegmentedControl
        segments={SEGMENTS}
        value={mode}
        onChange={changeMode}
        accessibilityLabel="Feed"
        testID="feed-mode"
      />
    </View>
  );

  let empty: ReactElement;
  if (feed.isPending) empty = <PostSkeletonList />;
  else if (feed.isError)
    empty = <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />;
  else empty = <FeedEmpty mode={mode} />;

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Header
        size="tab"
        title="Community"
        style={[styles.title, { paddingTop: insets.top + space.sm }]}
        trailing={
          <>
            <NotificationBell variant="glass" testID="community-notifications" />
            <IconButton
              variant="glass"
              icon="plus"
              accessibilityLabel="Share a dish"
              onPress={openCompose}
              testID="compose-button"
            />
            <IconButton
              variant="glass"
              icon="person"
              accessibilityLabel="Profile"
              onPress={openProfile}
              testID="community-profile"
            />
          </>
        }
      />
      <FlashList
        key={mode}
        data={feed.posts}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={Gap}
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
            refreshing={isPulling}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
      />
    </View>
  );
}

function Gap() {
  return <View style={styles.gap} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: { paddingHorizontal: gutter, paddingBottom: space.md },
  content: { paddingHorizontal: gutter, paddingBottom: space.huge },
  header: { gap: space.xl, paddingTop: space.xs, paddingBottom: space.lg },
  gap: { height: space.lg },
  footer: { paddingVertical: space.xl },
});
