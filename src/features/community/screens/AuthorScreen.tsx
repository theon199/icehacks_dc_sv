import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { router, Stack } from 'expo-router';
import { useCallback } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, StyleSheet, View } from 'react-native';

import { EmptyState, ErrorState, IconButton, Screen, Text, gutter, space, useTheme } from '@/ui';

import { isNotFound } from '../api/rpcError';
import type { ProfileSummary } from '../api/schemas';
import type { Post } from '../api/types';
import { PostSkeletonList } from '../components/PostSkeleton';
import { PostTile } from '../components/PostTile';
import { ProfileHeader } from '../components/ProfileHeader';
import { useForgetOtherViewers, useViewer } from '../hooks/queryKeys';
import { useBlockUser, useFollow, useProfileSummary } from '../hooks/useAuthor';
import { useAuthorFeed } from '../hooks/useFeed';

export interface AuthorScreenProps {
  authorId: string;
}

const keyExtractor = (post: Post) => post.id;
const renderTile = ({ item }: ListRenderItemInfo<Post>) => <PostTile post={item} />;

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/community');
}

function useAuthorMenu(profile: ProfileSummary | undefined) {
  const { mutate: block } = useBlockUser();
  return useCallback(() => {
    if (!profile || profile.is_self) return;
    const who = `@${profile.handle}`;
    const report = () =>
      router.push({ pathname: '/moderation/report', params: { target: 'user', id: profile.id } });
    const confirmBlock = () =>
      Alert.alert(
        `Block ${who}?`,
        "You won't see each other's posts or comments, and any follows between you are removed.",
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Block',
            style: 'destructive',
            onPress: () => block(profile.id, { onSuccess: leave }),
          },
        ],
      );
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: profile.display_name,
          options: [`Report ${who}`, `Block ${who}`, 'Cancel'],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 2,
        },
        (index) => (index === 0 ? report() : index === 1 ? confirmBlock() : undefined),
      );
    } else {
      Alert.alert(profile.display_name, undefined, [
        { text: `Report ${who}`, onPress: report },
        { text: `Block ${who}`, style: 'destructive', onPress: confirmBlock },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, [block, profile]);
}

/** Someone's profile with follow/unfollow and a grid of their posts. */
export function AuthorScreen({ authorId }: AuthorScreenProps) {
  const theme = useTheme();
  useForgetOtherViewers(useViewer());
  const summary = useProfileSummary(authorId);
  const profile = summary.data;
  const feed = useAuthorFeed(authorId, profile != null);
  const follow = useFollow(authorId);
  const openMenu = useAuthorMenu(profile);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;
  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  if (summary.isPending) {
    return (
      <Screen>
        <PostSkeletonList count={1} />
      </Screen>
    );
  }
  if (!profile) {
    return (
      <Screen>
        {isNotFound(summary.error) ? (
          <EmptyState
            icon="person.crop.circle.badge.xmark"
            title="Profile not available"
            message="This account may have been deleted, or one of you has blocked the other."
            actionLabel="Back"
            onAction={leave}
          />
        ) : (
          <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
        )}
      </Screen>
    );
  }

  const header = (
    <View style={styles.header}>
      <ProfileHeader
        profile={profile}
        followPending={follow.isPending}
        onToggleFollow={() => follow.mutate(!profile.is_following)}
      />
      <Text variant="title3">{profile.is_self ? 'Your posts' : 'Posts'}</Text>
    </View>
  );

  const empty = feed.isPending ? (
    <ActivityIndicator color={theme.colors.primary} style={styles.loading} />
  ) : feed.isError ? (
    <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />
  ) : (
    <Text variant="callout" tone="muted" style={styles.loading}>
      {profile.is_self
        ? "You haven't shared anything yet. Post a dish you cooked from the Community tab."
        : 'No posts to show yet.'}
    </Text>
  );

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen
        options={{
          title: profile.display_name,
          ...(profile.is_self
            ? {}
            : {
                headerRight: () => (
                  <IconButton
                    icon="ellipsis.circle"
                    accessibilityLabel="More options for this profile"
                    color="primary"
                    onPress={openMenu}
                  />
                ),
              }),
        }}
      />
      <FlashList
        data={feed.posts}
        renderItem={renderTile}
        keyExtractor={keyExtractor}
        numColumns={3}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          feed.isFetchingNextPage ? (
            <ActivityIndicator color={theme.colors.primary} style={styles.loading} />
          ) : null
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: gutter - 2, paddingTop: space.lg, paddingBottom: space.huge },
  header: { gap: space.xl, paddingBottom: space.md, paddingHorizontal: 2 },
  loading: { paddingVertical: space.xl, paddingHorizontal: 2 },
});
