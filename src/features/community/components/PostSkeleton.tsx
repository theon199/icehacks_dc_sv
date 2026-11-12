import { StyleSheet, View } from 'react-native';

import { Card, Skeleton, SkeletonGroup } from '@/ui';

function OneCard() {
  return (
    <Card padding="md" style={styles.card}>
      <View style={styles.header}>
        <Skeleton width={36} height={36} radius="pill" />
        <View style={styles.lines}>
          <Skeleton width="40%" height={14} />
          <Skeleton width="25%" height={12} />
        </View>
      </View>
      <Skeleton height={220} radius="md" />
      <Skeleton width="70%" height={16} />
      <Skeleton width="90%" height={14} />
    </Card>
  );
}

/** Placeholder cards while the first feed page loads. */
export function PostSkeletonList({ count = 2 }: { count?: number }) {
  return (
    <SkeletonGroup label="Loading posts" style={styles.list}>
      {Array.from({ length: count }, (_, index) => (
        <OneCard key={index} />
      ))}
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  list: { gap: 16 },
  card: { gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lines: { flex: 1, gap: 6 },
});
