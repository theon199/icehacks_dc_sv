import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, PressableScale, Text, useTheme } from '@/ui';

import { openPost } from './PostCard';
import type { Post } from '../api/types';

/** Square tile in an author's posts grid: the first photo, or the title for text-only posts. */
export const PostTile = memo(function PostTile({ post }: { post: Post }) {
  const theme = useTheme();
  const photo = post.media[0];
  const held = post.status !== 'visible';
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={held ? `${post.title}, waiting for review` : post.title}
      pressedScale={0.97}
      onPress={() => openPost(post.id)}
      style={[
        styles.tile,
        { backgroundColor: theme.colors.surfaceSunken, borderRadius: theme.radii.sm },
      ]}
    >
      {photo ? (
        <Image
          source={photo.url ? { uri: photo.url, cacheKey: photo.path } : null}
          placeholder={photo.blurhash ? { blurhash: photo.blurhash } : null}
          contentFit="cover"
          recyclingKey={photo.path}
          style={StyleSheet.absoluteFill}
          accessible={false}
        />
      ) : (
        <View style={styles.textTile}>
          <Icon
            name={post.kind === 'tip' ? 'lightbulb' : 'fork.knife'}
            android={post.kind === 'tip' ? 'lightbulb' : 'restaurant'}
            size={18}
            color="textSubtle"
          />
          <Text variant="caption" numberOfLines={4} accessible={false}>
            {post.title}
          </Text>
        </View>
      )}
      {held ? (
        <View style={[styles.held, { backgroundColor: theme.colors.warningSoft }]}>
          <Icon name="clock" android="schedule" size={12} color="onWarningSoft" />
        </View>
      ) : null}
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  tile: { flex: 1, aspectRatio: 1, overflow: 'hidden', margin: 2 },
  textTile: { flex: 1, padding: 8, gap: 4, justifyContent: 'center' },
  held: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
