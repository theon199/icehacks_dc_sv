import { StyleSheet, View } from 'react-native';

import { Card, Icon, ListRow, Text } from '@/ui';

import { openPost } from './PostCard';
import type { Post } from '../api/types';
import { usePost, useRemixes } from '../hooks/usePost';

/** "Based on …" link to the post this one remixes. Hidden when that post is out of reach. */
export function BasedOn({ parentPostId }: { parentPostId: string }) {
  const parent = usePost(parentPostId);
  const post = parent.data;
  if (!post) return null;
  return (
    <Card padding="sm" variant="sunken">
      <ListRow
        icon="arrow.triangle.branch"
        title={`Based on ${post.title}`}
        subtitle={`by ${post.author_display_name}`}
        onPress={() => openPost(post.id)}
        accessibilityHint="Opens the original post"
      />
    </Card>
  );
}

/** Remixes other people made of this post. */
export function RemixList({ post }: { post: Post }) {
  const remixes = useRemixes(post.id, post.kind !== 'tip');
  const items = remixes.data ?? [];
  if (items.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.heading}>
        <Icon name="arrow.triangle.branch" android="call_split" size={16} color="textMuted" />
        <Text variant="headline">{items.length === 1 ? '1 remix' : `${items.length} remixes`}</Text>
      </View>
      <Card padding="sm">
        {items.map((remix, index) => (
          <ListRow
            key={remix.id}
            title={remix.title}
            subtitle={`by ${remix.author_display_name}`}
            divider={index < items.length - 1}
            onPress={() => openPost(remix.id)}
          />
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
