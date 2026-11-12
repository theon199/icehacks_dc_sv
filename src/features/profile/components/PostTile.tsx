import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, PressableScale, space, Text, useTheme } from '@/ui';

import type { PostTileData } from '../deps';

export interface PostTileProps {
  post: PostTileData;
  onPress: (postId: string) => void;
}

/** Square tile in the "my posts" grid: the cover photo, or the title for text-only posts. */
export const PostTile = memo(function PostTile({ post, onPress }: PostTileProps) {
  const theme = useTheme();
  const held = post.status !== 'visible';
  const label = [
    post.title,
    held ? 'held for review, only you can see it' : null,
    `${post.likeCount} ${post.likeCount === 1 ? 'like' : 'likes'}`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onPress(post.id)}
      pressedScale={0.97}
      style={[styles.tile, { backgroundColor: theme.colors.surfaceSunken }]}
      testID={`post-${post.id}`}
    >
      {post.coverUrl ? (
        <Image
          source={{ uri: post.coverUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          recyclingKey={post.id}
          transition={120}
          accessible={false}
        />
      ) : (
        <View style={styles.textOnly}>
          <Text variant="caption" numberOfLines={4} accessible={false}>
            {post.title}
          </Text>
        </View>
      )}
      {held ? (
        <View style={[styles.flag, { backgroundColor: theme.colors.warningSoft }]}>
          <Icon name="eye.slash" size={12} color="onWarningSoft" />
        </View>
      ) : null}
      {post.photoCount > 1 ? (
        <View style={styles.stack}>
          <Icon name="square.on.square" size={14} color="textInverse" />
        </View>
      ) : null}
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  tile: { flex: 1, aspectRatio: 1, margin: 1, overflow: 'hidden' },
  textOnly: { flex: 1, padding: space.sm, justifyContent: 'flex-end' },
  flag: { position: 'absolute', top: space.xs, left: space.xs, padding: 4, borderRadius: 10 },
  stack: { position: 'absolute', top: space.xs, right: space.xs },
});
