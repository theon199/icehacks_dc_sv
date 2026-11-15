import { FlashList, type FlashListRef, type ListRenderItem } from '@shopify/flash-list';
import { useCallback, useRef, type ReactElement, type RefObject } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import type { ChefMessage } from '@/stores';
import { gutter, space } from '@/ui';

import { MessageBubble } from './MessageBubble';
import { NEAR_END_SHARE, isNearEnd, type ThreadMetrics } from '../logic/threadEnd';

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
 *
 * The list only follows new messages. It does not follow the viewport shrinking for the keyboard
 * or the footer growing (the "Thinking" card, an error card), which would leave the reply area
 * below the visible part of the thread; `useStayAtEnd` covers those two.
 */
export function MessageList({ messages, footer }: MessageListProps) {
  const list = useRef<FlashListRef<ChefMessage>>(null);
  const stayAtEnd = useStayAtEnd(list);
  const renderItem: ListRenderItem<ChefMessage> = useCallback(
    ({ item }) => <MessageBubble message={item} />,
    [],
  );
  return (
    <View style={styles.frame} onLayout={stayAtEnd.onLayout} testID="chef-thread">
      <FlashList
        ref={list}
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
        onScroll={stayAtEnd.onScroll}
        onContentSizeChange={stayAtEnd.onContentSizeChange}
        maintainVisibleContentPosition={{
          startRenderingFromBottom: true,
          autoscrollToBottomThreshold: NEAR_END_SHARE,
        }}
      />
    </View>
  );
}

/**
 * Keeps the thread on its newest message when its viewport changes height or its content grows,
 * but only if the person was at the end just before the change. Each check uses the metrics from
 * before the change: once the keyboard has shrunk the viewport, the reader looks far from the end.
 * The viewport comes from the frame's layout only, so a scroll event fired by the resize itself
 * cannot make the reader look as if they had scrolled away.
 */
function useStayAtEnd(list: RefObject<FlashListRef<ChefMessage> | null>) {
  const metrics = useRef<ThreadMetrics>({ offset: 0, content: 0, viewport: 0 });

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize } = event.nativeEvent;
    metrics.current = { ...metrics.current, offset: contentOffset.y, content: contentSize.height };
  }, []);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const before = metrics.current;
      const viewport = event.nativeEvent.layout.height;
      metrics.current = { ...before, viewport };
      // Frame for frame with the keyboard, so no animation of its own.
      if (before.viewport > 0 && viewport !== before.viewport && isNearEnd(before)) {
        list.current?.scrollToEnd({ animated: false });
      }
    },
    [list],
  );

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      const before = metrics.current;
      metrics.current = { ...before, content: height };
      if (before.content > 0 && height > before.content && isNearEnd(before)) {
        list.current?.scrollToEnd({ animated: true });
      }
    },
    [list],
  );

  return { onScroll, onLayout, onContentSizeChange };
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  content: { paddingHorizontal: gutter, paddingTop: space.sm, paddingBottom: space.huge },
  separator: { height: space.lg },
});
