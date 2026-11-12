import { FlashList } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import {
  EmptyState,
  ErrorState,
  gutter,
  Screen,
  Skeleton,
  SkeletonGroup,
  space,
  useTheme,
} from '@/ui';

import { EditProfileSheet } from '../components/EditProfileSheet';
import { PostTile } from '../components/PostTile';
import { ProfileOverview } from '../components/ProfileOverview';
import type { PostTileData } from '../deps';
import { profileKeys } from '../hooks/queryKeys';
import { useMyPosts, useMyProfile, useMyUserId } from '../hooks/useProfileData';

const COLUMNS = 3;

function LoadingProfile() {
  return (
    <Screen>
      <SkeletonGroup>
        <Skeleton width={96} height={96} radius="pill" />
        <Skeleton width="60%" height={28} />
        <Skeleton width="35%" height={18} />
        <Skeleton height={140} radius="md" />
      </SkeletonGroup>
    </Screen>
  );
}

/** The signed-in person's profile: identity, stats, badges and a grid of their posts. */
export function ProfileScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const userId = useMyUserId();
  const profile = useMyProfile();
  const posts = useMyPosts();
  const [editing, setEditing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const openPost = useCallback((postId: string) => router.push(`/post/${postId}`), []);
  const renderItem = useCallback(
    ({ item }: { item: PostTileData }) => <PostTile post={item} onPress={openPost} />,
    [openPost],
  );

  const refresh = async () => {
    if (!userId) return;
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: profileKeys.me(userId) }),
        queryClient.invalidateQueries({ queryKey: profileKeys.statsAll(userId) }),
        queryClient.invalidateQueries({ queryKey: profileKeys.posts(userId) }),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  if (profile.isPending) return <LoadingProfile />;
  if (!profile.data) {
    return (
      <Screen>
        <ErrorState
          error={profile.error}
          title="Your profile didn't load"
          onRetry={() => void profile.refetch()}
        />
      </Screen>
    );
  }

  const items = posts.data?.pages.flatMap((page) => page.items) ?? [];
  const postsEmpty = posts.isPending ? (
    <View style={styles.padded}>
      <Skeleton height={120} radius="md" />
    </View>
  ) : posts.error ? (
    <ErrorState
      error={posts.error}
      title="Your posts didn't load"
      onRetry={() => void posts.refetch()}
    />
  ) : (
    <EmptyState
      icon="camera"
      title="Nothing shared yet"
      message="Cooked something you are proud of? Share it with the community."
      actionLabel="Share a dish"
      onAction={() => router.push('/compose')}
    />
  );

  return (
    <View
      style={[styles.flex, { backgroundColor: theme.colors.background }]}
      testID="profile-screen"
    >
      <FlashList
        data={items}
        numColumns={COLUMNS}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={
          <ProfileOverview
            profile={profile.data}
            onEdit={() => setEditing(true)}
            onFriends={() => router.push('/friends')}
            onSettings={() => router.push('/settings')}
          />
        }
        ListEmptyComponent={postsEmpty}
        ListFooterComponent={<View style={styles.footer} />}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (posts.hasNextPage && !posts.isFetchingNextPage) void posts.fetchNextPage();
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={theme.colors.primary}
          />
        }
      />
      {editing ? (
        <EditProfileSheet profile={profile.data} onClose={() => setEditing(false)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: { paddingHorizontal: gutter },
  footer: { height: space.xxxl },
});
