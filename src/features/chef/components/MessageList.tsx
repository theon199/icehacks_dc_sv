import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { useCallback, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ChefMessage } from '@/stores';
import { gutter, space } from '@/ui';

import { MessageBubble } from './MessageBubble';

export interface MessageListProps {
  messages: readonly ChefMessage[];
  /** Status, errors and suggestions under the newest message. */
  footer: ReactElement | null;
}

const keyOf = (message: ChefMessage) => message.id;

/**
 * The thread, oldest first, anchored to the bottom like any chat: it opens on the newest message
 * and follows new ones while the person is near the end, without yanking them back down while
 * they read older turns. (FlashList v2 replaces the old `inverted` list with this behaviour.)
 */
export function MessageList({ messages, footer }: MessageListProps) {
  const renderItem: ListRenderItem<ChefMessage> = useCallback(
    ({ item }) => <MessageBubble message={item} />,
    [],
  );
  return (
    <FlashList
      testID="chef-messages"
      data={messages}
      renderItem={renderItem}
      keyExtractor={keyOf}
      getItemType={(message) => message.role}
      ItemSeparatorComponent={Separator}
      ListFooterComponent={footer}
      contentContainerStyle={styles.content}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      maintainVisibleContentPosition={{
        startRenderingFromBottom: true,
        autoscrollToBottomThreshold: 0.2,
      }}
    />
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: gutter, paddingTop: space.lg, paddingBottom: space.md },
  separator: { height: space.lg },
});
