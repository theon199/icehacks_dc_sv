import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { router, Stack } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, StyleSheet, View } from 'react-native';

import { reportHref } from '@/features/moderation';
import {
  GlassIconButton,
  Screen,
  Text,
  errorMessageFor,
  fontFamily,
  gutter,
  space,
  useTheme,
} from '@/ui';

import { isNotFound } from '../api/rpcError';
import type { ProfileSummary } from '../api/schemas';
import type { Post } from '../api/types';
import { CommunityStateCard } from '../components/CommunityStateCard';
import { PostSkeletonList } from '../components/PostSkeleton';
import { PostTile } from '../components/PostTile';
import { ProfileHeader } from '../components/ProfileHeader';
import { ScreenTopBar } from '../components/ScreenTopBar';
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
      router.push(reportHref({ kind: 'user', id: profile.id }, profile.display_name));
    const confirmBlock = () =>
      Alert.alert(
        `Block ${who}?`,
        "You won't see each other's posts or comments, and any follows between you are removed.",
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Block',
            style: 'destructive',
            onPress: () =>
              block(
                {
                  userId: profile.id,
                  displayName: profile.display_name,
                  handle: profile.handle || null,
                },
                { onSuccess: leave },
              ),
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

const hideNativeBar = { headerShown: false } as const;

/** The glass top bar over whatever state the profile is in. */
function AuthorFrame({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen options={hideNativeBar} />
      <ScreenTopBar title={title} onBack={leave} trailing={trailing} />
      {children}
    </View>
  );
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
      <AuthorFrame title="">
        <Screen>
          <PostSkeletonList count={1} />
        </Screen>
      </AuthorFrame>
    );
  }
  if (!profile) {
    return (
      <AuthorFrame title="">
        <Screen>
          {isNotFound(summary.error) ? (
            <CommunityStateCard
              testID="author-unavailable"
              title="Profile not available"
              message="This account may have been deleted, or one of you has blocked the other."
              actions={[{ label: 'Back', onPress: leave }]}
            />
          ) : (
            <CommunityStateCard
              testID="author-error"
              alert
              title="This profile could not be loaded"
              message={errorMessageFor(summary.error)}
              actions={[{ label: 'Try again', onPress: () => void summary.refetch() }]}
            />
          )}
        </Screen>
      </AuthorFrame>
    );
  }

  const header = (
    <View style={styles.header}>
      <ProfileHeader
        profile={profile}
        followPending={follow.isPending}
        onToggleFollow={() => follow.mutate(!profile.is_following)}
      />
      <Text variant="headline" style={styles.section}>
        {profile.is_self ? 'Your posts' : 'Posts'}
      </Text>
    </View>
  );

  const empty = (
    <View style={styles.state}>
      {feed.isPending ? (
        <CommunityStateCard loading loadingLabel="Loading posts" message="Loading posts…" />
      ) : feed.isError ? (
        <CommunityStateCard
          alert
          title="Posts could not be loaded"
          message={errorMessageFor(feed.error)}
          actions={[{ label: 'Try again', onPress: () => void feed.refetch() }]}
        />
      ) : (
        <CommunityStateCard
          title="No posts yet"
          message={
            profile.is_self
              ? "You haven't shared anything yet. Post a dish you cooked from the Community tab."
              : 'No posts to show yet.'
          }
        />
      )}
    </View>
  );

  return (
    <AuthorFrame
      title={profile.display_name}
      trailing={
        profile.is_self ? undefined : (
          <GlassIconButton
            icon="ellipsis"
            accessibilityLabel="More options for this profile"
            onPress={openMenu}
          />
        )
      }
    >
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
    </AuthorFrame>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { fontFamily: fontFamily.textBold },
  content: {
    paddingHorizontal: gutter - 2,
    paddingTop: space.sm,
    paddingBottom: space.sectionLarge,
  },
  header: { gap: space.xl, paddingBottom: space.md, paddingHorizontal: 2 },
  loading: { paddingVertical: space.xl, paddingHorizontal: 2 },
  state: { paddingHorizontal: 2 },
});
