import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo } from 'react';
import { Alert, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSessionStore } from '@/features/auth';
import {
  Avatar,
  Button,
  errorMessageFor,
  fontFamily,
  Skeleton,
  SkeletonGroup,
  Text,
  toast,
  useTheme,
} from '@/ui';
import { gutter, space } from '@/ui/tokens';

import { lookupBlocked, useBlockedDirectory } from '../blockedDirectory';
import { ModerationPage } from '../components/ModerationPage';
import { ModerationStateCard } from '../components/ModerationStateCard';
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
  const insets = useSafeAreaInsets();
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
      <ModerationPage title="Blocked people" scroll={false}>
        <SkeletonGroup label="Loading blocked people" style={styles.padded}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={64} radius="lg" />
          ))}
        </SkeletonGroup>
      </ModerationPage>
    );
  }

  if (blocks.isError) {
    return (
      <ModerationPage title="Blocked people">
        <ModerationStateCard
          alert
          title="Something didn't load"
          message={errorMessageFor(blocks.error)}
          action={{ label: 'Try again', onPress: () => void blocks.refetch() }}
        />
      </ModerationPage>
    );
  }

  return (
    <ModerationPage title="Blocked people" scroll={false}>
      <FlashList
        data={rows}
        keyExtractor={(row) => row.userId}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ ...styles.padded, paddingBottom: insets.bottom + space.xl }}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={
          <Text variant="body" tone="muted" style={styles.intro}>
            {
              "Blocked people can't see your posts, comments or profile, and you won't see theirs. They aren't told that you blocked them."
            }
          </Text>
        }
        ListEmptyComponent={
          <ModerationStateCard
            title="No one is blocked"
            message="If someone makes Famara unpleasant, you can block them from their profile."
          />
        }
        renderItem={({ item: row }) => (
          <View
            style={[
              styles.row,
              { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg },
            ]}
          >
            <Avatar name={row.name} size={40} />
            <View style={styles.text}>
              <Text variant="body" numberOfLines={1} style={styles.name}>
                {row.name}
              </Text>
              <Text variant="label" tone="muted">
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
    </ModerationPage>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  padded: { paddingHorizontal: gutter, paddingTop: space.md },
  intro: { paddingBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  text: { flex: 1, gap: 2 },
  name: { fontFamily: fontFamily.textBold },
  separator: { height: space.sm },
});
