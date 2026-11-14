import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  ErrorState,
  GlassButtonGroup,
  Skeleton,
  SkeletonGroup,
  space,
  Text,
  fontFamily,
  useTheme,
  type GlassButtonGroupItem,
} from '@/ui';

import { EditProfileSheet } from '../components/EditProfileSheet';
import { PostTile } from '../components/PostTile';
import { ProfileExtras } from '../components/ProfileExtras';
import { ProfileOverview } from '../components/ProfileOverview';
import { ProfileTopBar, TOP_BAR_CLEARANCE } from '../components/ProfileTopBar';
import type { PostTileData } from '../deps';
import { useShareInvite } from '../hooks/useFriends';
import { useMyPosts, useMyProfile } from '../hooks/useProfileData';
import { useProfileRefresh } from '../hooks/useProfileRefresh';

const COLUMNS = 3;
/** Posts shown before "See all". */
const RECENT_LIMIT = 6;
/** Each tile's margin; the list's edge padding gives it back so the grid lines up. */
const TILE_GAP = 2;

/** Background, top safe area and the floating bar shared by every state of the screen. */
function Frame({ trailing, children }: { trailing?: ReactNode; children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.flex, { paddingTop: insets.top, backgroundColor: theme.colors.background }]}
      testID="profile-screen"
    >
      {children}
      <ProfileTopBar title="Profile" fallbackHref="/" trailing={trailing} />
    </View>
  );
}

function PostsEmpty() {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.emptyCard,
        { backgroundColor: theme.colors.surface, borderRadius: theme.radii.tile },
      ]}
    >
      <Text variant="headline">Nothing shared yet</Text>
      <Text variant="subhead" tone="muted">
        Cooked something you are proud of? Share it with the community.
      </Text>
      <Button
        label="Share a dish"
        variant="secondary"
        size="sm"
        icon="camera"
        onPress={() => router.push('/compose')}
        style={styles.emptyAction}
      />
    </View>
  );
}

/**
 * The signed-in person's profile, top to bottom: the streak, who they are, their totals, their
 * recent dishes, badges and the way into Friends. Share (an invite link) and Settings ride in one
 * glass capsule beside the screen name.
 */
export function ProfileScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const profile = useMyProfile();
  const posts = useMyPosts();
  const pull = useProfileRefresh();
  const share = useShareInvite();
  const [sheetOpen, showSheet] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const shareMutate = share.mutate;
  const actions = useMemo<readonly GlassButtonGroupItem[]>(
    () => [
      {
        icon: 'square.and.arrow.up',
        accessibilityLabel: 'Share an invite link',
        accessibilityHint: 'Invite a friend to follow each other on Famara',
        onPress: () => shareMutate(),
        testID: 'profile-share',
      },
      {
        icon: 'gearshape',
        accessibilityLabel: 'Settings',
        onPress: () => router.push('/settings'),
        testID: 'profile-settings',
      },
    ],
    [shareMutate],
  );
  const headerActions = <GlassButtonGroup items={actions} testID="profile-actions" />;

  const openPost = useCallback((postId: string) => router.push(`/post/${postId}`), []);
  const openFriends = useCallback(() => router.push('/friends'), []);

  const items = useMemo(() => posts.data?.pages.flatMap((page) => page.items) ?? [], [posts.data]);
  const visible = showAll ? items : items.slice(0, RECENT_LIMIT);
  const hasMore = items.length > RECENT_LIMIT || posts.hasNextPage;
  const count = visible.length;
  const lastRow = Math.floor((count - 1) / COLUMNS);

  const renderItem = useCallback(
    ({ item, index }: { item: PostTileData; index: number }) => {
      const row = Math.floor(index / COLUMNS);
      const column = index % COLUMNS;
      return (
        <PostTile
          post={item}
          onPress={openPost}
          roundTopLeft={index === 0}
          roundTopRight={index === COLUMNS - 1}
          roundBottomLeft={row === lastRow && column === 0}
          roundBottomRight={row === lastRow && column === COLUMNS - 1}
        />
      );
    },
    [openPost, lastRow],
  );

  if (profile.isPending) {
    return (
      <Frame trailing={headerActions}>
        <SkeletonGroup style={[styles.content, { paddingTop: TOP_BAR_CLEARANCE }]}>
          <Skeleton height={150} radius="card" />
          <Skeleton height={96} radius="tile" />
          <Skeleton height={62} radius="md" />
        </SkeletonGroup>
      </Frame>
    );
  }
  if (!profile.data) {
    return (
      <Frame trailing={headerActions}>
        <View style={[styles.flex, { paddingTop: TOP_BAR_CLEARANCE }]}>
          <ErrorState
            error={profile.error}
            title="Your profile didn't load"
            onRetry={() => void profile.refetch()}
          />
        </View>
      </Frame>
    );
  }

  const postsAction = hasMore ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={showAll ? 'Show fewer dishes' : 'See all your dishes'}
      hitSlop={12}
      onPress={() => setShowAll((previous) => !previous)}
    >
      <Text variant="label" style={styles.link}>
        {showAll ? 'Show fewer' : 'See all'}
      </Text>
    </Pressable>
  ) : null;

  const postsEmpty = posts.isPending ? (
    <View style={styles.inset}>
      <Skeleton height={120} radius="tile" />
    </View>
  ) : posts.error ? (
    <View style={styles.inset}>
      <ErrorState
        error={posts.error}
        title="Your posts didn't load"
        onRetry={() => void posts.refetch()}
      />
    </View>
  ) : (
    <View style={styles.inset}>
      <PostsEmpty />
    </View>
  );

  return (
    <Frame trailing={headerActions}>
      <FlashList
        data={visible}
        numColumns={COLUMNS}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        extraData={lastRow}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          ...styles.content,
          paddingTop: TOP_BAR_CLEARANCE,
          paddingBottom: insets.bottom + space.xl,
        }}
        ListHeaderComponent={
          <View style={styles.inset}>
            <ProfileOverview
              profile={profile.data}
              onEdit={() => showSheet(true)}
              postsAction={postsAction}
            />
          </View>
        }
        ListEmptyComponent={postsEmpty}
        ListFooterComponent={
          <View style={styles.inset}>
            <ProfileExtras onFriends={openFriends} />
          </View>
        }
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (showAll && posts.hasNextPage && !posts.isFetchingNextPage) {
            void posts.fetchNextPage();
          }
        }}
        refreshControl={
          <RefreshControl
            refreshing={pull.refreshing}
            onRefresh={pull.refresh}
            tintColor={theme.colors.primary}
          />
        }
      />
      {sheetOpen ? (
        <EditProfileSheet profile={profile.data} onClose={() => showSheet(false)} />
      ) : null}
    </Frame>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: space.xl - TILE_GAP },
  inset: { marginHorizontal: TILE_GAP },
  link: { fontFamily: fontFamily.textBold },
  emptyCard: { padding: space.xl, gap: space.sm },
  emptyAction: { alignSelf: 'flex-start', marginTop: space.xs },
});
