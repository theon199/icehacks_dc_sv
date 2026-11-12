import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { IconButton, Text, useTheme } from '@/ui';
import { maxFontSizeMultiplier } from '@/ui/tokens';

import type { Comment } from '../api/types';
import { COMMENT_MAX_LENGTH, validateComment } from '../logic/comments';
import { publishErrorMessage } from '../logic/publishMessages';

export interface CommentComposerProps {
  replyTo: Comment | null;
  onCancelReply: () => void;
  onSend: (body: string, parentCommentId: string | null) => Promise<unknown>;
  autoFocus?: boolean;
  /** Bump this number to move the cursor into the comment box (e.g. from the post's comment button). */
  focusRequest?: number;
}

/** Where the composer is: idle, sending, or showing why the last attempt did not go through. */
type SendState = { phase: 'idle' } | { phase: 'sending' } | { phase: 'failed'; message: string };

const IDLE: SendState = { phase: 'idle' };

/** Text box pinned under the comments; keeps the text if sending fails. */
export function CommentComposer({
  replyTo,
  onCancelReply,
  onSend,
  autoFocus,
  focusRequest = 0,
}: CommentComposerProps) {
  const theme = useTheme();
  const input = useRef<TextInput>(null);
  const [text, setText] = useState('');
  const [sendState, setSendState] = useState<SendState>(IDLE);
  const sending = sendState.phase === 'sending';
  const error = sendState.phase === 'failed' ? sendState.message : null;

  useEffect(() => {
    if (replyTo) input.current?.focus();
  }, [replyTo]);

  useEffect(() => {
    if (focusRequest > 0) input.current?.focus();
  }, [focusRequest]);

  const send = async () => {
    const checked = validateComment(text);
    if (!checked.ok) {
      setSendState({ phase: 'failed', message: checked.error });
      return;
    }
    setSendState({ phase: 'sending' });
    try {
      await onSend(checked.body, replyTo?.id ?? null);
      setText('');
      onCancelReply();
      setSendState(IDLE);
    } catch (failure) {
      setSendState({ phase: 'failed', message: publishErrorMessage(failure) });
    }
  };

  return (
    <View style={styles.wrap}>
      {replyTo ? (
        <View style={styles.replyBar}>
          <Text variant="caption" tone="muted" style={styles.flex} numberOfLines={1}>
            Replying to {replyTo.author_display_name}
          </Text>
          <IconButton
            icon="xmark"
            accessibilityLabel="Cancel reply"
            size={28}
            color="textSubtle"
            onPress={onCancelReply}
          />
        </View>
      ) : null}
      <View style={styles.row}>
        <TextInput
          ref={input}
          value={text}
          onChangeText={(next) => {
            setText(next);
            if (error) setSendState(IDLE);
          }}
          placeholder={replyTo ? 'Write a reply' : 'Add a comment'}
          accessibilityLabel={replyTo ? 'Reply' : 'Comment'}
          placeholderTextColor={theme.colors.textSubtle}
          selectionColor={theme.colors.primary}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
          maxLength={COMMENT_MAX_LENGTH + 50}
          multiline
          autoFocus={autoFocus}
          editable={!sending}
          testID="comment-input"
          style={[
            styles.input,
            theme.typography.callout,
            {
              color: theme.colors.text,
              backgroundColor: theme.colors.surfaceSunken,
              borderRadius: theme.radii.md,
            },
          ]}
        />
        <IconButton
          icon="arrow.up"
          accessibilityLabel={replyTo ? 'Send reply' : 'Send comment'}
          variant="filled"
          disabled={sending || text.trim().length === 0}
          onPress={() => void send()}
          testID="comment-send"
        />
      </View>
      {error ? (
        <Text variant="footnote" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  flex: { flex: 1 },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, minHeight: 40, maxHeight: 120, paddingHorizontal: 12, paddingVertical: 9 },
});
