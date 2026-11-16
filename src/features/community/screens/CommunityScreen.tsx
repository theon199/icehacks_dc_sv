import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';

import { defineKvKey } from '@/lib/storage/kv';
import { GlassIconButton, TabHeader, gutter, space, useTheme } from '@/ui';

import { feedModeSchema, type FeedMode } from '../api/schemas';
import type { Post } from '../api/types';
import { CommunityStateCard } from '../components/CommunityStateCard';
import { useCommunityViewMenu } from '../components/CommunityViewMenu';
import { FeedEmpty, FeedError } from '../components/FeedEmpty';
import { FeedModeButton } from '../components/FeedModeButton';
import { PostCard } from '../components/PostCard';
import { usePostMenu } from '../components/usePostMenu';
import { WeeklyTopDishes } from '../components/WeeklyTopDishes';
import { NotificationBell, ProfileButton } from '../deps';
import { useForgetOtherViewers, useViewer } from '../hooks/queryKeys';
import { useFeed } from '../hooks/useFeed';

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

/**
 * The Community tab: this week's most-cooked dishes, then the feed. Which feed (Following,
 * Popular, New) is chosen from the glass menu on the header's filter circle; the title opens the
 * food map instead.
 */
export function CommunityScreen() {
  const theme = useTheme();
  useForgetOtherViewers(useViewer());
  const [mode, setMode] = useState<FeedMode>(readLastMode);
  const feed = useFeed(mode);
  const openMenu = usePostMenu();
  const viewMenu = useCommunityViewMenu('feed');
  // Only a pull shows the spinner; background refetches stay quiet.
  const [isPulling, setIsPulling] = useState<boolean>(false);

  const changeMode = useCallback((next: FeedMode) => {
    setMode(next);
    try {
      lastMode.setSync(next);
    } catch {
      // Remembering the feed is a convenience only.
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

  // With nothing in the feed, the card that says why sits above the rail, as the first thing.
  let state = null;
  if (feed.posts.length === 0) {
    if (feed.isPending)
      state = (
        <CommunityStateCard
          loading
          title="Loading Community"
          message="Getting the community feed ready…"
        />
      );
    else if (feed.isError)
      state = <FeedError error={feed.error} onRetry={() => void feed.refetch()} />;
    else state = <FeedEmpty mode={mode} />;
  }

  const header = (
    <View style={styles.header}>
      {state}
      <WeeklyTopDishes />
    </View>
  );

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <TabHeader
        title={viewMenu.title}
        titleMenu={viewMenu.titleMenu}
        titleMenuRef={viewMenu.titleMenuRef}
        testID="community-header"
        trailing={
          <>
            <FeedModeButton mode={mode} onChange={changeMode} />
            <NotificationBell variant="glass" testID="community-notifications" />
            <GlassIconButton
              icon="plus"
              accessibilityLabel="Share a dish"
              onPress={openCompose}
              testID="compose-button"
            />
            <ProfileButton testID="community-profile" />
          </>
        }
      />
      {viewMenu.menu}
      <FlashList
        key={mode}
        data={feed.posts}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={Gap}
        ListHeaderComponent={header}
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
  content: { paddingHorizontal: gutter, paddingBottom: space.sectionLarge },
  header: { gap: space.xl, marginBottom: space.xl },
  gap: { height: space.md },
  footer: { paddingVertical: space.xl },
});
