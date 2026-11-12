import { router } from 'expo-router';
import { memo } from 'react';
import { ActionSheetIOS, Alert, Platform, StyleSheet, View } from 'react-native';

import { Button, IconButton, Text, useTheme } from '@/ui';

import { AuthorLine } from './AuthorLine';
import { openAuthor } from './PostCard';
import type { Comment } from '../api/types';
import { isDeleted } from '../logic/comments';

export interface CommentItemProps {
  comment: Comment;
  isReply: boolean;
  isOwn: boolean;
  onReply?: (comment: Comment) => void;
  onDelete: (comment: Comment) => void;
  onBlock: (comment: Comment) => void;
}

function showMenu({ comment, isOwn, onDelete, onBlock }: CommentItemProps) {
  const who = comment.author_handle ? `@${comment.author_handle}` : comment.author_display_name;
  const confirmDelete = () =>
    Alert.alert('Delete this comment?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(comment) },
    ]);
  const confirmBlock = () =>
    Alert.alert(
      `Block ${who}?`,
      "You won't see each other's posts or comments, and any follows between you are removed.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: () => onBlock(comment) },
      ],
    );
  const report = () =>
    router.push({ pathname: '/moderation/report', params: { target: 'comment', id: comment.id } });

  const items = isOwn
    ? [{ label: 'Delete comment', destructive: true, run: confirmDelete }]
    : [
        { label: 'Report comment', destructive: false, run: report },
        { label: `Block ${who}`, destructive: true, run: confirmBlock },
      ];
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [...items.map((item) => item.label), 'Cancel'],
        cancelButtonIndex: items.length,
        destructiveButtonIndex: items.flatMap((item, index) => (item.destructive ? [index] : [])),
      },
      (index) => items[index]?.run(),
    );
  } else {
    Alert.alert('Comment', undefined, [
      ...items.map((item) => ({
        text: item.label,
        style: item.destructive ? ('destructive' as const) : ('default' as const),
        onPress: item.run,
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }
}

/** One comment or reply, with reply and report/block/delete actions. */
export const CommentItem = memo(function CommentItem(props: CommentItemProps) {
  const { comment, isReply, isOwn, onReply } = props;
  const theme = useTheme();
  const deleted = isDeleted(comment);
  // comment_cards has no team flag yet, so comments cannot show the team badge (see PR follow-ups).
  // Only top-level comments take replies. A reply whose parent is out of view is listed at the
  // top level so it is not lost, but it is still a reply and the server would refuse another.
  const canReply =
    !isReply &&
    onReply != null &&
    comment.parent_comment_id == null &&
    comment.status === 'visible';

  return (
    <View
      style={[styles.row, isReply && [styles.reply, { borderLeftColor: theme.colors.border }]]}
      testID={`comment-${comment.id}`}
    >
      {deleted ? (
        <Text variant="footnote" tone="subtle" style={styles.deleted}>
          This comment was deleted.
        </Text>
      ) : (
        <>
          <View style={styles.header}>
            <AuthorLine
              name={comment.author_display_name}
              handle={comment.author_handle}
              avatarUrl={comment.authorAvatarUrl}
              isTeam={false}
              createdAt={comment.created_at}
              avatarSize={28}
              onPress={() => openAuthor(comment.author_id)}
            />
            <IconButton
              icon="ellipsis"
              accessibilityLabel="More options for this comment"
              size={32}
              color="textSubtle"
              onPress={() => showMenu(props)}
            />
          </View>
          {comment.status !== 'visible' ? (
            <Text variant="caption" color="warning">
              {isOwn
                ? 'Waiting for review. Only you can see this.'
                : 'Hidden from the community while it is reviewed.'}
            </Text>
          ) : null}
          <Text variant="callout">{comment.body}</Text>
          {canReply ? (
            <Button
              label="Reply"
              variant="ghost"
              size="sm"
              haptic={false}
              onPress={() => onReply?.(comment)}
              style={styles.replyButton}
            />
          ) : null}
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { gap: 4, paddingVertical: 8 },
  reply: { marginLeft: 18, paddingLeft: 12, borderLeftWidth: 2 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  deleted: { fontStyle: 'italic', paddingVertical: 6 },
  replyButton: { alignSelf: 'flex-start', paddingHorizontal: 0 },
});
