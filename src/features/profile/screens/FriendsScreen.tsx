import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorState, Skeleton, SkeletonGroup, space, Text, fontFamily, useTheme } from '@/ui';

import { InviteSection } from '../components/InviteSection';
import { PersonRow } from '../components/PersonRow';
import { ProfileTopBar, TOP_BAR_CLEARANCE } from '../components/ProfileTopBar';
import { SectionTitle } from '../components/SectionTitle';
import {
  useConnections,
  useFollowToggle,
  usePendingFollowIds,
  useSuggestions,
} from '../hooks/useFriends';
import { useFriendsRefresh } from '../hooks/useProfileRefresh';
import type { Person } from '../model/connections';
import { buildFriendRows, type FriendRow } from '../model/friendRows';

/** Friends (mutual follows), one-way follows, suggestions and invites. */
export function FriendsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const connections = useConnections();
  const suggestions = useSuggestions();
  const follow = useFollowToggle();
  const pendingIds = usePendingFollowIds();
  const pull = useFriendsRefresh();

  const rows = useMemo(
    () => (connections.groups ? buildFriendRows(connections.groups, suggestions.data ?? []) : []),
    [connections.groups, suggestions.data],
  );
  const peopleById = useMemo(() => {
    const map = new Map<string, Person>();
    for (const row of rows) if (row.type === 'person') map.set(row.person.id, row.person);
    return map;
  }, [rows]);

  const openPerson = useCallback((personId: string) => router.push(`/author/${personId}`), []);
  const { mutate } = follow;
  const changeFollow = useCallback(
    (userId: string, next: boolean) => {
      const person = peopleById.get(userId);
      if (person) mutate({ person, follow: next });
    },
    [mutate, peopleById],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: FriendRow; index: number }) => {
      switch (item.type) {
        case 'section':
          return (
            <View style={styles.section}>
              <SectionTitle
                title={item.title}
                trailing={
                  item.count != null ? (
                    <Text variant="caption" tone="muted" style={styles.count}>
                      {item.count}
                    </Text>
                  ) : null
                }
              />
            </View>
          );
        case 'note':
          return (
            <Text variant="subhead" tone="muted" style={styles.note}>
              {item.message}
            </Text>
          );
        case 'person':
          return (
            <PersonRow
              person={item.person}
              relation={item.relation}
              detail={item.detail}
              busy={pendingIds.has(item.person.id)}
              onOpen={openPerson}
              onFollowChange={changeFollow}
              first={rows[index - 1]?.type !== 'person'}
              last={rows[index + 1]?.type !== 'person'}
            />
          );
      }
    },
    [pendingIds, openPerson, changeFollow, rows],
  );

  const header = (
    <View style={styles.header}>
      <InviteSection />
    </View>
  );

  const empty = connections.isPending ? (
    <SkeletonGroup label="Loading friends">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} height={60} radius="tile" />
      ))}
    </SkeletonGroup>
  ) : (
    <ErrorState
      error={connections.error}
      title="Your friends didn't load"
      onRetry={() => void connections.refetch()}
    />
  );

  return (
    <View
      style={[styles.flex, { paddingTop: insets.top, backgroundColor: theme.colors.background }]}
      testID="friends-screen"
    >
      <FlashList
        testID="friends-list"
        data={rows}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.type}
        renderItem={renderItem}
        extraData={pendingIds}
        contentInsetAdjustmentBehavior="never"
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={{ ...styles.content, paddingBottom: insets.bottom + space.xl }}
        refreshControl={
          <RefreshControl
            refreshing={pull.refreshing}
            onRefresh={pull.refresh}
            tintColor={theme.colors.primary}
          />
        }
      />
      <ProfileTopBar title="Friends" fallbackHref="/profile" />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingBottom: space.xs },
  content: { paddingHorizontal: space.xl, paddingTop: TOP_BAR_CLEARANCE },
  section: { paddingTop: space.xl, paddingBottom: space.sm },
  count: { fontFamily: fontFamily.textBold },
  note: { paddingBottom: space.sm },
});
