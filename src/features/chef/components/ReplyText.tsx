import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, space } from '@/ui';

import { parseReply, type Span } from '../logic/replyFormat';

function Spans({ spans }: { spans: readonly Span[] }) {
  return spans.map((span, index) =>
    span.bold ? (
      <Text key={index} variant="bodyStrong">
        {span.text}
      </Text>
    ) : (
      span.text
    ),
  );
}

/** A Chef reply: paragraphs, bullet lists and bold runs, selectable for copying. */
export const ReplyText = memo(function ReplyText({ text }: { text: string }) {
  const blocks = useMemo(() => parseReply(text), [text]);
  return (
    <View style={styles.blocks}>
      {blocks.map((block, index) =>
        block.kind === 'paragraph' ? (
          <Text key={index} variant="body" selectable>
            <Spans spans={block.spans} />
          </Text>
        ) : (
          <View key={index} style={styles.list}>
            {block.items.map((item, itemIndex) => (
              <View key={itemIndex} style={styles.item}>
                <Text variant="body" tone="muted" accessible={false}>
                  {'•'}
                </Text>
                <Text variant="body" selectable style={styles.flex}>
                  <Spans spans={item} />
                </Text>
              </View>
            ))}
          </View>
        ),
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  blocks: { gap: space.sm },
  list: { gap: space.xs },
  item: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
});
