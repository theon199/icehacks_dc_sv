import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo } from 'react';
import { Alert, RefreshControl, StyleSheet, View } from 'react-native';

import { useSessionStore } from '@/features/auth';
import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  errorMessageFor,
  Skeleton,
  SkeletonGroup,
  Text,
  toast,
  useTheme,
} from '@/ui';
import { gutter, space } from '@/ui/tokens';

import { lookupBlocked, useBlockedDirectory } from '../blockedDirectory';
import { useBlocks, useUnblockUser } from '../queries';

interface BlockedRow {
  userId: string;
  name: string;
  handle: string | null;
  since: string;
}

const UNNAMED = 'Blocked member';

export function BlockedUsersScreen() {
  const theme = useTheme();
  const userId = useSessionStore((s) => s.userId);
  const blocks = useBlocks();
  const people = useBlockedDirectory((s) => s.people);
  const unblock = useUnblockUser();

  const rows = useMemo<BlockedRow[]>(
    () =>
      (blocks.data ?? []).map((block) => {
        const person = userId ? lookupBlocked(people, userId, block.blocked_id) : null;
        return {
          userId: block.blocked_id,
          name: person?.displayName || UNNAMED,
          handle: person?.handle ?? null,
          since: new Date(block.created_at).toLocaleDateString(),
        };
      }),
    [blocks.data, people, userId],
  );

  const confirmUnblock = useCallback(
    (row: BlockedRow) => {
      const name = row.name === UNNAMED ? 'this member' : row.name;
      Alert.alert(
        `Unblock ${name}?`,
        "You'll see each other's posts and comments again. They won't be told, and you won't follow each other automatically.",
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Unblock',
            onPress: () =>
              unblock.mutate(row.userId, {
                onSuccess: () => toast.success(`Unblocked ${name}.`),
                onError: (error) => toast.error(errorMessageFor(error)),
              }),
          },
        ],
      );
    },
    [unblock],
  );

  if (blocks.isPending) {
    return (
      <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
        <SkeletonGroup label="Loading blocked people" style={styles.padded}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={52} radius="md" />
          ))}
        </SkeletonGroup>
      </View>
    );
  }

  if (blocks.isError) {
    return (
      <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
        <ErrorState error={blocks.error} onRetry={() => void blocks.refetch()} />
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <FlashList
        data={rows}
        keyExtractor={(row) => row.userId}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.padded}
        ListHeaderComponent={
          rows.length > 0 ? (
            <Text variant="footnote" tone="muted" style={styles.intro}>
              {
                "Blocked people can't see your posts, comments or profile, and you won't see theirs. They aren't told that you blocked them."
              }
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="hand.raised"
            title="No one is blocked"
            message="If someone makes Famara unpleasant, you can block them from their profile."
          />
        }
        renderItem={({ item: row }) => (
          <View style={[styles.row, { borderColor: theme.colors.border }]}>
            <Avatar name={row.name} size={40} />
            <View style={styles.text}>
              <Text variant="body" numberOfLines={1}>
                {row.name}
              </Text>
              <Text variant="footnote" tone="subtle">
                {row.handle ? `@${row.handle} · ` : ''}Blocked {row.since}
              </Text>
            </View>
            <Button
              label="Unblock"
              size="sm"
              variant="secondary"
              onPress={() => confirmUnblock(row)}
              disabled={unblock.isPending && unblock.variables === row.userId}
              accessibilityHint={`Unblocks ${row.name}`}
              testID={`unblock-${row.userId}`}
            />
          </View>
        )}
        refreshControl={
          <RefreshControl
            refreshing={blocks.isRefetching}
            onRefresh={() => void blocks.refetch()}
            tintColor={theme.colors.primary}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: { paddingHorizontal: gutter, paddingTop: space.md },
  intro: { paddingBottom: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, gap: space.xxs },
});
