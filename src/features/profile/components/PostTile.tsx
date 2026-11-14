import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatNumber } from '@/lib/format';
import { Icon, PressableScale, photoOverlay, space, Text, fontFamily, useTheme } from '@/ui';

import type { PostTileData } from '../deps';

/** Outer corner radius of the posts grid; inner edges stay square. */
export const GRID_RADIUS = 18;

export interface PostTileProps {
  post: PostTileData;
  onPress: (postId: string) => void;
  /** Which outer corners of the grid this tile sits on. */
  roundTopLeft?: boolean;
  roundTopRight?: boolean;
  roundBottomLeft?: boolean;
  roundBottomRight?: boolean;
}

/** Square tile in the "my posts" grid: the cover photo, or the title for text-only posts. */
export const PostTile = memo(function PostTile({
  post,
  onPress,
  roundTopLeft = false,
  roundTopRight = false,
  roundBottomLeft = false,
  roundBottomRight = false,
}: PostTileProps) {
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
      style={[
        styles.tile,
        {
          backgroundColor: theme.colors.primarySoft,
          borderTopLeftRadius: roundTopLeft ? GRID_RADIUS : 0,
          borderTopRightRadius: roundTopRight ? GRID_RADIUS : 0,
          borderBottomLeftRadius: roundBottomLeft ? GRID_RADIUS : 0,
          borderBottomRightRadius: roundBottomRight ? GRID_RADIUS : 0,
        },
      ]}
      testID={`post-${post.id}`}
    >
      {post.coverUrl ? (
        <Image
          source={{ uri: post.coverUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          recyclingKey={post.id}
          priority="normal"
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
      {post.coverUrl ? (
        <View pointerEvents="none" style={[styles.chip, styles.likes]}>
          <Icon name="heart.fill" size={11} color="onImage" />
          <Text variant="caption" color="onImage" accessible={false} style={styles.count}>
            {formatNumber(post.likeCount, 0)}
          </Text>
        </View>
      ) : null}
      {held ? (
        <View pointerEvents="none" style={[styles.chip, styles.topRight]}>
          <Icon name="eye.slash" size={11} color="onImage" />
        </View>
      ) : null}
      {post.photoCount > 1 ? (
        <View pointerEvents="none" style={[styles.chip, styles.topLeft]}>
          <Icon name="square.on.square" size={11} color="onImage" />
        </View>
      ) : null}
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  tile: { flex: 1, aspectRatio: 1, margin: 2, overflow: 'hidden' },
  textOnly: { flex: 1, padding: space.sm, justifyContent: 'flex-end' },
  chip: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    padding: 4,
    borderRadius: 999,
    backgroundColor: photoOverlay.chip,
  },
  likes: { left: 5, bottom: 5, paddingHorizontal: 6, paddingVertical: 2 },
  count: { fontFamily: fontFamily.textBold },
  topRight: { top: 5, right: 5 },
  topLeft: { top: 5, left: 5 },
});
