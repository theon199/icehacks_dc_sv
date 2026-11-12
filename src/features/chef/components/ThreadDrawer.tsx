import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { memo, useCallback } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatRelativeTime } from '@/lib/format';
import { selectThreadList, useChefStore, type ChefThread } from '@/stores';
import { Button, IconButton, PressableScale, Text, gutter, space, useTheme } from '@/ui';

import { readPhotoMark } from '../logic/conversation';

export interface ThreadDrawerProps {
  visible: boolean;
  activeThreadId: string | null;
  onSelect: (threadId: string) => void;
  onNewThread: () => void;
  onClose: () => void;
}

const UNTITLED = 'New chat';

function threadTitle(thread: ChefThread): string {
  return readPhotoMark(thread.title).text || UNTITLED;
}

const ThreadRow = memo(function ThreadRow({
  thread,
  active,
  onSelect,
  onDelete,
}: {
  thread: ChefThread;
  active: boolean;
  onSelect: (threadId: string) => void;
  onDelete: (thread: ChefThread) => void;
}) {
  const theme = useTheme();
  const title = threadTitle(thread);
  const when = formatRelativeTime(thread.updatedAt);
  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: active ? theme.colors.primarySoft : 'transparent',
          borderRadius: theme.radii.md,
        },
      ]}
    >
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${when}`}
        accessibilityState={{ selected: active }}
        onPress={() => onSelect(thread.id)}
        pressedScale={0.99}
        style={styles.rowText}
      >
        <Text variant="body" numberOfLines={1} accessible={false}>
          {title}
        </Text>
        <Text variant="footnote" tone="subtle" accessible={false}>
          {when}
        </Text>
      </PressableScale>
      <IconButton
        icon="trash"
        accessibilityLabel={`Delete ${title}`}
        color="textSubtle"
        size={36}
        onPress={() => onDelete(thread)}
      />
    </View>
  );
});

/** Slide-over list of Chef threads: switch between them, start a new one or delete one. */
export function ThreadDrawer({
  visible,
  activeThreadId,
  onSelect,
  onNewThread,
  onClose,
}: ThreadDrawerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const threads = useChefStore(selectThreadList);

  const confirmDelete = useCallback(
    (thread: ChefThread) => {
      Alert.alert(
        'Delete this chat?',
        `"${threadTitle(thread)}" will be removed from all your devices.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              useChefStore.getState().remove(thread.id);
              if (thread.id === activeThreadId) onNewThread();
            },
          },
        ],
      );
    },
    [activeThreadId, onNewThread],
  );

  const renderItem: ListRenderItem<ChefThread> = useCallback(
    ({ item }) => (
      <ThreadRow
        thread={item}
        active={item.id === activeThreadId}
        onSelect={onSelect}
        onDelete={confirmDelete}
      />
    ),
    [activeThreadId, confirmDelete, onSelect],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          testID="chef-thread-drawer"
          accessibilityViewIsModal
          style={[
            styles.panel,
            {
              backgroundColor: theme.colors.surface,
              paddingTop: insets.top + space.md,
              paddingBottom: insets.bottom + space.md,
            },
          ]}
        >
          <View style={styles.header}>
            <Text variant="title2">Your chats</Text>
            <IconButton icon="xmark" accessibilityLabel="Close chats" onPress={onClose} />
          </View>
          <Button
            testID="chef-new-thread"
            label="New chat"
            icon="square.and.pencil"
            variant="secondary"
            fullWidth
            onPress={onNewThread}
          />
          {threads.length === 0 ? (
            <Text variant="callout" tone="muted" style={styles.empty}>
              Your conversations with Chef show up here.
            </Text>
          ) : (
            <FlashList
              data={threads}
              renderItem={renderItem}
              keyExtractor={(thread) => thread.id}
              extraData={activeThreadId}
              contentContainerStyle={styles.list}
            />
          )}
        </View>
        <Pressable
          style={[styles.scrim, { backgroundColor: theme.colors.scrim }]}
          accessibilityRole="button"
          accessibilityLabel="Close chats"
          onPress={onClose}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row' },
  panel: { width: '82%', maxWidth: 380, paddingHorizontal: gutter, gap: space.md },
  scrim: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  list: { paddingVertical: space.sm },
  empty: { paddingVertical: space.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space.md,
    marginBottom: space.xxs,
    minHeight: 56,
  },
  rowText: { flex: 1, paddingVertical: space.sm, gap: 2 },
});
