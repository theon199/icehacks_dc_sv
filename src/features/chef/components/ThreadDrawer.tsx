import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { memo, useCallback } from 'react';
import { Alert, Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatRelativeTime } from '@/lib/format';
import { selectThreadList, useChefStore, type ChefThread } from '@/stores';
import {
  GlassIconButton,
  Icon,
  IconButton,
  PressableScale,
  Text,
  fontFamily,
  radii,
  space,
  useTheme,
} from '@/ui';

import { AskHeader } from './AskHeader';
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

function threadMeta(thread: ChefThread): string {
  const count = thread.messages.length;
  const messages = count === 1 ? '1 message' : `${count} messages`;
  return `${formatRelativeTime(thread.updatedAt)} · ${messages}`;
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
  const meta = threadMeta(thread);
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          ...theme.elevation.medium,
          shadowColor: theme.colors.shadow,
        },
        active ? { borderWidth: 1, borderColor: theme.colors.success } : null,
      ]}
    >
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${title}${active ? ', current' : ''}, ${meta}`}
        accessibilityState={{ selected: active }}
        accessibilityActions={[{ name: 'delete', label: `Delete ${title}` }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'delete') onDelete(thread);
        }}
        onPress={() => onSelect(thread.id)}
        pressedScale={0.99}
        style={styles.cardText}
      >
        <Text variant="headline" numberOfLines={2} accessible={false}>
          {title}
        </Text>
        <View style={styles.metaRow}>
          {active ? (
            <View style={[styles.current, { backgroundColor: theme.colors.highlightSoft }]}>
              <View style={[styles.currentDot, { backgroundColor: theme.colors.success }]} />
              <Text variant="caption" style={styles.currentText} accessible={false}>
                Current
              </Text>
            </View>
          ) : null}
          <Text variant="caption" tone="muted" accessible={false}>
            {meta}
          </Text>
        </View>
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

/**
 * Past chats as their own page, sliding up over Chef: a glass back circle and New chat in the
 * header, then one card per thread to switch to it or delete it.
 */
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
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View
        testID="chef-thread-drawer"
        style={[styles.page, { backgroundColor: theme.colors.background }]}
      >
        <AskHeader
          title="Your chats"
          backLabel="Back to Chef"
          onBack={onClose}
          testID="chef-threads-header"
          trailing={
            <GlassIconButton
              icon="square.and.pencil"
              accessibilityLabel="New chat"
              accessibilityHint="Starts a new conversation with Chef"
              onPress={onNewThread}
              testID="chef-new-thread"
            />
          }
        />
        {threads.length === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.colors.surface }]}>
              <Icon name="book" size={23} color="textMuted" />
            </View>
            <Text variant="headline" align="center">
              Your next good idea starts here
            </Text>
            <Text variant="caption" tone="muted" align="center">
              Your conversations with Chef show up here.
            </Text>
          </View>
        ) : (
          <FlashList
            data={threads}
            renderItem={renderItem}
            keyExtractor={(thread) => thread.id}
            extraData={activeThreadId}
            ItemSeparatorComponent={Gap}
            contentContainerStyle={{
              paddingHorizontal: space.xl,
              paddingBottom: insets.bottom + space.sectionLarge,
            }}
          />
        )}
      </View>
    </Modal>
  );
}

function Gap() {
  return <View style={styles.gap} />;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.xl,
    paddingRight: space.sm,
  },
  cardText: {
    flex: 1,
    minHeight: 72,
    paddingVertical: space.md + space.xxs,
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm },
  current: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radii.pill,
  },
  currentDot: { width: 6, height: 6, borderRadius: 3 },
  currentText: { fontFamily: fontFamily.textBold },
  gap: { height: space.sm + space.xxs },
  empty: {
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.xl,
    paddingVertical: space.sectionLarge,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
});
