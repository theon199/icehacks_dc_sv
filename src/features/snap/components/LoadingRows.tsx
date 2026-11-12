import { StyleSheet, View } from 'react-native';

import { Skeleton, SkeletonGroup, space } from '@/ui';

/** Placeholder rows while matching recipes load. */
export function LoadingRows({ count = 3, label }: { count?: number; label: string }) {
  return (
    <SkeletonGroup label={label} style={styles.group}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={styles.row}>
          <Skeleton width={64} height={64} radius="sm" />
          <View style={styles.text}>
            <Skeleton width="80%" height={18} />
            <Skeleton width="50%" height={14} />
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  text: { flex: 1, gap: space.sm },
});
