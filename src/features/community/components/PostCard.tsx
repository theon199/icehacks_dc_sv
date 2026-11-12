import { router } from 'expo-router';
import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, IconButton, PressableScale, Text, useTheme } from '@/ui';

import { AuthorLine } from './AuthorLine';
import { PhotoCarousel } from './PhotoCarousel';
import { PostActions } from './PostActions';
import { RatingStars } from './RatingStars';
import { RecipeChip } from './RecipeChip';
import type { Post } from '../api/types';

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
}: PostCardProps) {
  const theme = useTheme();
  const tag = KIND_TAG[post.kind];
  const openDetail = useCallback(() => openPost(post.id), [post.id]);
  const openComments = useCallback(() => {
    if (full) return;
    openPost(post.id, true);
  }, [full, post.id]);

  const body = (
    <View style={styles.body}>
      {tag ? (
        <Text variant="overline" tone="accent">
          {tag}
        </Text>
      ) : null}
      <Text variant="headline">{post.title}</Text>
      {post.body ? (
        <Text variant="callout" tone="muted" numberOfLines={full ? undefined : 4}>
          {post.body}
        </Text>
      ) : null}
    </View>
  );

  return (
    <Card padding="md" style={styles.card} testID={`post-card-${post.id}`}>
      <View style={styles.header}>
        <AuthorLine
          name={post.author_display_name}
          handle={post.author_handle}
          avatarUrl={post.authorAvatarUrl}
          isTeam={post.author_is_team}
          createdAt={post.created_at}
          onPress={() => openAuthor(post.author_id)}
        />
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
            { backgroundColor: theme.colors.warningSoft, borderRadius: theme.radii.sm },
          ]}
        >
          <Text variant="footnote" color="onWarningSoft">
            Only you can see this post while it is being reviewed.
          </Text>
        </View>
      ) : null}

      {post.media.length > 0 ? (
        <PhotoCarousel photos={post.media} label={post.title} priority={priority} />
      ) : null}

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
          {post.recipe_ref ? <RecipeChip recipeId={post.recipe_ref} /> : null}
          {post.rating != null ? <RatingStars rating={post.rating} /> : null}
        </View>
      ) : null}

      <PostActions post={post} onComment={openComments} />
    </Card>
  );
});

const styles = StyleSheet.create({
  card: { gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  body: { gap: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  notice: { paddingHorizontal: 10, paddingVertical: 6 },
});
