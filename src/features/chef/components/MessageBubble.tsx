import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ChefMessage } from '@/stores';
import { Icon, Text, space, useTheme } from '@/ui';

import { RecipeCardRow } from './RecipeCardRow';
import { ReplyText } from './ReplyText';
import { readPhotoMark } from '../logic/conversation';

/** One turn of a Chef thread: the person's question on the right, Chef's answer on the left. */
export const MessageBubble = memo(function MessageBubble({ message }: { message: ChefMessage }) {
  const theme = useTheme();
  if (message.role === 'user') {
    const { text, hasPhoto } = readPhotoMark(message.text);
    return (
      <View style={styles.userRow}>
        <View
          style={[
            styles.bubble,
            styles.user,
            { backgroundColor: theme.colors.primary, borderRadius: theme.radii.lg },
          ]}
        >
          {hasPhoto ? (
            <View style={styles.photoTag} accessible accessibilityLabel="Sent with a photo">
              <Icon name="photo" size={14} color="onPrimary" />
              <Text variant="caption" color="onPrimary" accessible={false}>
                Photo
              </Text>
            </View>
          ) : null}
          <Text variant="body" color="onPrimary" selectable>
            {text}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.assistant}>
      <View
        style={[
          styles.bubble,
          { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg },
        ]}
      >
        <ReplyText text={message.text} />
      </View>
      {message.recipeIds.length > 0 ? <RecipeCardRow ids={message.recipeIds} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  userRow: { alignItems: 'flex-end' },
  bubble: { paddingHorizontal: space.md, paddingVertical: space.sm + 2, gap: space.xs },
  user: { maxWidth: '85%' },
  assistant: { gap: space.sm, maxWidth: '100%' },
  photoTag: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
