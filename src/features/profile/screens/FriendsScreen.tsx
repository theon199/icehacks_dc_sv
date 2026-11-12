import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { ErrorState, gutter, Skeleton, SkeletonGroup, space, Text, useTheme } from '@/ui';

import { InviteSection } from '../components/InviteSection';
import { PersonRow } from '../components/PersonRow';
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
    ({ item }: { item: FriendRow }) => {
      switch (item.type) {
        case 'section':
          return (
            <SectionTitle
              title={item.title}
              trailing={
                item.count != null ? (
                  <Text variant="subhead" tone="subtle">
                    {item.count}
                  </Text>
                ) : null
              }
            />
          );
        case 'note':
          return (
            <Text variant="callout" tone="muted" style={styles.note}>
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
            />
          );
      }
    },
    [pendingIds, openPerson, changeFollow],
  );

  const header = (
    <View style={styles.header}>
      <InviteSection />
    </View>
  );

  const empty = connections.isPending ? (
    <SkeletonGroup label="Loading friends">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} height={52} radius="md" />
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
      style={[styles.flex, { backgroundColor: theme.colors.background }]}
      testID="friends-screen"
    >
      <FlashList
        testID="friends-list"
        data={rows}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.type}
        renderItem={renderItem}
        extraData={pendingIds}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={pull.refreshing}
            onRefresh={pull.refresh}
            tintColor={theme.colors.primary}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingTop: space.lg, paddingBottom: space.sm },
  content: { paddingHorizontal: gutter, paddingBottom: space.xxxl },
  note: { paddingVertical: space.sm },
});
