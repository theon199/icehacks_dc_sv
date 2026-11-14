import { router } from 'expo-router';
import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatRelativeTime } from '@/lib/format';
import { Card, IconButton, PressableScale, Text, space, useTheme } from '@/ui';

import { AuthorLine } from './AuthorLine';
import { DishLine } from './DishLine';
import { PhotoCarousel } from './PhotoCarousel';
import { PostActions } from './PostActions';
import { RatingStars } from './RatingStars';
import type { Post } from '../api/types';
import { useViewer } from '../hooks/queryKeys';

const KIND_TAG: Record<Post['kind'], string | null> = {
  cook: null,
  remix: 'Remix',
  tip: 'Kitchen tip',
};

export interface PostCardProps {
  post: Post;
  /** Opens the post menu (report, block, delete). */
  onMenu: (post: Post) => void;
  /** Feed cards clamp long notes; the detail screen shows everything. */
  full?: boolean;
  /** Load the first photo eagerly (cards near the top of the feed). */
  priority?: 'low' | 'normal' | 'high';
  /**
   * Detail screen only: focuses its comment box. Without it the comment button is hidden there.
   * Feed cards always open the post with the comment box focused.
   */
  onComment?: (() => void) | undefined;
}

export function openPost(postId: string, focusComments = false) {
  router.push({
    pathname: '/post/[id]',
    params: focusComments ? { id: postId, comments: '1' } : { id: postId },
  });
}

export function openAuthor(authorId: string) {
  router.push({ pathname: '/author/[id]', params: { id: authorId } });
}

/** A post in the feed or at the top of its detail page. */
export const PostCard = memo(function PostCard({
  post,
  onMenu,
  full = false,
  priority = 'normal',
  onComment,
}: PostCardProps) {
  const theme = useTheme();
  const viewer = useViewer();
  const tag = KIND_TAG[post.kind];
  const openDetail = useCallback(() => openPost(post.id), [post.id]);
  const openComments = useCallback(() => openPost(post.id, true), [post.id]);
  // On the detail screen the button focuses the comment box there, or is hidden when the post
  // cannot take comments; in the feed it opens the post with the box focused.
  const commentAction = full ? onComment : openComments;

  const body = (
    <View style={styles.body}>
      {tag ? (
        <View
          style={[
            styles.tag,
            { backgroundColor: theme.colors.highlightSoft, borderRadius: theme.radii.pill },
          ]}
        >
          <Text variant="caption" color="onHighlightSoft">
            {tag}
          </Text>
        </View>
      ) : null}
      <Text variant="headline">{post.title}</Text>
      {post.body ? (
        <Text variant="callout" tone="muted" numberOfLines={full ? undefined : 3}>
          {post.body}
        </Text>
      ) : null}
    </View>
  );

  return (
    <Card padding="none" style={styles.card} testID={`post-card-${post.id}`}>
      <View style={styles.header}>
        <View style={styles.author}>
          <AuthorLine
            name={post.author_display_name}
            handle={post.author_handle}
            avatarUrl={post.authorAvatarUrl}
            isTeam={post.author_is_team}
            createdAt={post.created_at}
            hideTime
            onPress={() => openAuthor(post.author_id)}
          />
        </View>
        <Text variant="footnote" tone="muted" accessible={false}>
          {formatRelativeTime(post.created_at)}
        </Text>
        <IconButton
          icon="ellipsis"
          accessibilityLabel="More options for this post"
          size={36}
          color="textMuted"
          onPress={() => onMenu(post)}
        />
      </View>

      {post.status !== 'visible' ? (
        <View
          style={[
            styles.notice,
            styles.inset,
            { backgroundColor: theme.colors.warningSoft, borderRadius: theme.radii.sm },
          ]}
        >
          <Text variant="footnote" color="onWarningSoft">
            {post.author_id === viewer
              ? 'Only you can see this post while it is being reviewed.'
              : 'Hidden from the community while it is reviewed.'}
          </Text>
        </View>
      ) : null}

      {post.media.length > 0 ? (
        <PhotoCarousel
          photos={post.media}
          label={post.title}
          priority={priority}
          inset={CARD_PADDING}
        />
      ) : null}

      <View style={[styles.content, styles.inset]}>
        {full ? (
          body
        ) : (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={post.title}
            accessibilityHint="Opens the post"
            pressedScale={0.995}
            pressedOpacity={0.8}
            onPress={openDetail}
          >
            {body}
          </PressableScale>
        )}

        {post.recipe_ref || post.rating != null ? (
          <View style={styles.meta}>
            {post.recipe_ref ? (
              <View style={styles.dish}>
                <DishLine recipeId={post.recipe_ref} />
              </View>
            ) : null}
            {post.rating != null ? <RatingStars rating={post.rating} /> : null}
          </View>
        ) : null}

        <PostActions post={post} onComment={commentAction} />
      </View>
    </Card>
  );
});

const CARD_PADDING = space.lg;

const styles = StyleSheet.create({
  card: { gap: space.md, paddingTop: space.md, paddingBottom: space.xs },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingLeft: CARD_PADDING,
    paddingRight: space.sm,
  },
  author: { flex: 1, flexShrink: 1 },
  inset: { marginHorizontal: CARD_PADDING },
  content: { gap: space.sm },
  body: { gap: space.xs, alignItems: 'flex-start' },
  tag: { paddingHorizontal: space.sm, paddingVertical: space.xxs },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.md },
  dish: { flexShrink: 1 },
  notice: { paddingHorizontal: 10, paddingVertical: 6 },
});
