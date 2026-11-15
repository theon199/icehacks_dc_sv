import { router } from 'expo-router';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatRelativeTime } from '@/lib/format';
import { Icon, PressableScale, Text, fontFamily, space, useTheme } from '@/ui';

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
      <Text variant="headline" style={styles.title}>
        {post.title}
      </Text>
      {post.body ? (
        <Text variant="subhead" tone="muted" numberOfLines={full ? undefined : 3}>
          {post.body}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.tile,
          borderColor: theme.colors.border,
          borderWidth: theme.scheme === 'dark' ? StyleSheet.hairlineWidth : 0,
        },
      ]}
      testID={`post-card-${post.id}`}
    >
      <View style={styles.header}>
        <View style={styles.author}>
          <AuthorLine
            name={post.author_display_name}
            handle={post.author_handle}
            avatarUrl={post.authorAvatarUrl}
            isTeam={post.author_is_team}
            createdAt={post.created_at}
            avatarSize={30}
            hideTime
            onPress={() => openAuthor(post.author_id)}
          />
        </View>
        <Text variant="caption" tone="muted" accessible={false} style={styles.age}>
          {formatRelativeTime(post.created_at)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More options for this post"
          hitSlop={space.sm}
          onPress={() => onMenu(post)}
          style={({ pressed }) => [styles.more, pressed && styles.pressed]}
        >
          <Icon name="ellipsis" size={20} color="textMuted" />
        </Pressable>
      </View>

      {post.status !== 'visible' ? (
        <View
          style={[
            styles.notice,
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

      <View style={styles.content}>
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
    </View>
  );
});

/** Side padding of everything inside the card, lined up with the photo strip. */
const CARD_PADDING = space.md;

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: CARD_PADDING,
    paddingVertical: space.sm,
  },
  author: { flex: 1, flexShrink: 1 },
  age: { fontVariant: ['tabular-nums'] },
  more: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.55 },
  content: {
    gap: space.sm,
    paddingHorizontal: CARD_PADDING,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  body: { gap: space.xs, alignItems: 'flex-start' },
  title: { fontFamily: fontFamily.textBold },
  tag: { paddingHorizontal: space.sm, paddingVertical: space.xxs },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.md },
  dish: { flexShrink: 1 },
  notice: {
    marginHorizontal: CARD_PADDING,
    marginBottom: space.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
