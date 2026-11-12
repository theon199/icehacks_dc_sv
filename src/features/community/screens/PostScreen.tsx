import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useSessionStore } from '@/features/auth';
import { EmptyState, ErrorState, Screen, Text, gutter, space, useTheme } from '@/ui';

import type { Comment } from '../api/types';
import { CommentComposer } from '../components/CommentComposer';
import { CommentItem } from '../components/CommentItem';
import { PostCard } from '../components/PostCard';
import { PostSkeletonList } from '../components/PostSkeleton';
import { BasedOn, RemixList } from '../components/RemixLineage';
import { usePostMenu } from '../components/usePostMenu';
import { useBlockUser } from '../hooks/useAuthor';
import { useAddComment, useComments, useDeleteComment, usePost } from '../hooks/usePost';
import { threadComments } from '../logic/comments';

export interface PostScreenProps {
  postId: string;
  /** Opened from a comment button: focus the comment box. */
  focusComments?: boolean;
}

interface CommentEntry {
  comment: Comment;
  isReply: boolean;
}

const keyExtractor = (entry: CommentEntry) => entry.comment.id;

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/community');
}

/** A post with its remix lineage and comments (one level of replies). */
export function PostScreen({ postId, focusComments = false }: PostScreenProps) {
  const theme = useTheme();
  const userId = useSessionStore((state) => state.userId);
  const post = usePost(postId);
  const visible = post.data != null;
  const comments = useComments(postId, visible);
  const addComment = useAddComment(postId);
  const { mutate: removeComment } = useDeleteComment(postId);
  const { mutate: block } = useBlockUser();
  const openMenu = usePostMenu({ onDeleted: leave, onBlocked: leave });
  const [replyTo, setReplyTo] = useState<Comment | null>(null);

  const entries = useMemo<CommentEntry[]>(
    () =>
      threadComments(comments.data ?? []).flatMap((thread) => [
        { comment: thread.comment, isReply: false },
        ...thread.replies.map((reply) => ({ comment: reply, isReply: true })),
      ]),
    [comments.data],
  );

  const onBlockCommenter = useCallback((comment: Comment) => block(comment.author_id), [block]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<CommentEntry>) => (
      <CommentItem
        comment={item.comment}
        isReply={item.isReply}
        isOwn={item.comment.author_id === userId}
        onReply={setReplyTo}
        onDelete={removeComment}
        onBlock={onBlockCommenter}
      />
    ),
    [onBlockCommenter, removeComment, userId],
  );

  if (post.isPending) {
    return (
      <Screen>
        <PostSkeletonList count={1} />
      </Screen>
    );
  }
  if (post.isError) {
    return (
      <Screen>
        <ErrorState error={post.error} onRetry={() => void post.refetch()} />
      </Screen>
    );
  }
  const current = post.data;
  if (!current || current.status === 'removed') {
    return (
      <Screen>
        <EmptyState
          icon="eye.slash"
          title="This post isn't available"
          message="It may have been deleted or removed, or you can't see it from your account."
          actionLabel="Back to Community"
          onAction={leave}
        />
      </Screen>
    );
  }

  const header = (
    <View style={styles.header}>
      <PostCard post={current} onMenu={openMenu} full priority="high" />
      {current.parent_post_id ? <BasedOn parentPostId={current.parent_post_id} /> : null}
      <RemixList post={current} />
      <Text variant="title3">Comments</Text>
    </View>
  );

  const empty = comments.isPending ? (
    <ActivityIndicator color={theme.colors.primary} style={styles.loading} />
  ) : comments.isError ? (
    <ErrorState
      error={comments.error}
      title="Comments didn't load"
      onRetry={() => void comments.refetch()}
    />
  ) : (
    <Text variant="callout" tone="muted" style={styles.noComments}>
      No comments yet. Say what you think or ask how they made it.
    </Text>
  );

  return (
    <Screen
      scroll={false}
      padded={false}
      footer={
        current.status === 'visible' ? (
          <CommentComposer
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            autoFocus={focusComments}
            onSend={(body, parentCommentId) => addComment.mutateAsync({ body, parentCommentId })}
          />
        ) : undefined
      }
    >
      <FlashList
        data={entries}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={styles.content}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: gutter, paddingTop: space.lg, paddingBottom: space.xxl },
  header: { gap: space.lg, paddingBottom: space.sm },
  loading: { paddingVertical: space.xl },
  noComments: { paddingVertical: space.md },
});
