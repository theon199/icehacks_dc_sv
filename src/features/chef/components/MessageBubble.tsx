import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ChefMessage } from '@/stores';
import { Icon, Text, fontFamily, space, useTheme } from '@/ui';

import { AnswerCard } from './AnswerCard';
import { ChefBadge } from './ChefBadge';
import { RecipeRows } from './RecipeRows';
import { ReplyText } from './ReplyText';
import { readPhotoMark } from '../logic/conversation';

/**
 * One turn of a Chef thread: the person's question as an ink bubble on the right, Chef's answer as
 * one white card with its recipes inside it.
 */
export const MessageBubble = memo(function MessageBubble({ message }: { message: ChefMessage }) {
  const theme = useTheme();
  if (message.role === 'user') {
    const { text, hasPhoto } = readPhotoMark(message.text);
    return (
      <View style={styles.userRow}>
        <View
          style={[
            styles.user,
            {
              backgroundColor: theme.colors.primary,
              borderRadius: theme.radii.lg,
              borderBottomRightRadius: theme.radii.sm,
            },
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
          <Text variant="callout" color="onPrimary" selectable style={styles.userText}>
            {text}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <AnswerCard>
      <ChefBadge />
      <ReplyText text={message.text} />
      {message.recipeIds.length > 0 ? <RecipeRows ids={message.recipeIds} /> : null}
    </AnswerCard>
  );
});

const styles = StyleSheet.create({
  userRow: { alignItems: 'flex-end' },
  user: {
    maxWidth: '86%',
    paddingHorizontal: space.lg,
    paddingVertical: space.md - 1,
    gap: space.xs,
  },
  userText: { fontFamily: fontFamily.textSemiBold },
  photoTag: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
