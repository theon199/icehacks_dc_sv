import type { AndroidSymbol } from 'expo-symbols';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatNumber } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { Icon, PressableScale, Text, type IconName } from '@/ui';
import type { Palette } from '@/ui/tokens';

import type { Post } from '../api/types';
import { useToggleLike, useToggleSave } from '../hooks/useEngagement';

interface ActionProps {
  icon: IconName;
  android: AndroidSymbol;
  label: string;
  count?: number;
  active?: boolean;
  activeColor?: keyof Palette;
  onPress: () => void;
  testID?: string;
}

function Action({
  icon,
  android,
  label,
  count,
  active,
  activeColor,
  onPress,
  testID,
}: ActionProps) {
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={count != null ? `${label}, ${count}` : label}
      accessibilityState={active === undefined ? {} : { selected: active }}
      onPress={onPress}
      hitSlop={6}
      pressedScale={0.9}
      style={styles.action}
    >
      <Icon
        name={icon}
        android={android}
        size={22}
        color={active && activeColor ? activeColor : 'textMuted'}
        weight="semibold"
      />
      {count != null ? (
        <Text variant="footnote" tone="muted" accessible={false}>
          {formatNumber(count, 0)}
        </Text>
      ) : null}
    </PressableScale>
  );
}

export interface PostActionsProps {
  post: Post;
  onComment: () => void;
}

/** Like, comment and save for a post. Likes and saves update instantly and roll back on failure. */
export const PostActions = memo(function PostActions({ post, onComment }: PostActionsProps) {
  const like = useToggleLike(post.id);
  const save = useToggleSave(post.id);
  return (
    <View style={styles.row}>
      <Action
        testID="post-like"
        icon={post.liked_by_me ? 'heart.fill' : 'heart'}
        android={post.liked_by_me ? 'favorite' : 'favorite_border'}
        label={post.liked_by_me ? 'Unlike' : 'Like'}
        count={post.like_count}
        active={post.liked_by_me}
        activeColor="accent"
        onPress={() => {
          if (!post.liked_by_me) haptics.impact('light');
          like.mutate();
        }}
      />
      <Action
        testID="post-comment"
        icon="bubble.left"
        android="chat_bubble_outline"
        label="Comments"
        count={post.comment_count}
        onPress={onComment}
      />
      <View style={styles.spacer} />
      <Action
        testID="post-save"
        icon={post.saved_by_me ? 'bookmark.fill' : 'bookmark'}
        android={post.saved_by_me ? 'bookmark' : 'bookmark_border'}
        label={post.saved_by_me ? 'Remove from saved' : 'Save post'}
        active={post.saved_by_me}
        activeColor="primary"
        onPress={() => save.mutate()}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 6,
  },
  spacer: { flex: 1 },
});
