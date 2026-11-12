import { StyleSheet, View } from 'react-native';

import { Skeleton } from '@/ui';
import { space } from '@/ui/tokens';

const CELLS = [0, 1, 2, 3];

/** Placeholder grid while the first page of results loads. */
export function ResultsSkeleton() {
  return (
    <View
      style={styles.grid}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading recipes"
    >
      {CELLS.map((cell) => (
        <View key={cell} style={styles.cell}>
          <Skeleton height="auto" radius="md" style={styles.photo} />
          <Skeleton height={14} width="85%" />
          <Skeleton height={12} width="55%" />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '50%', paddingHorizontal: space.md / 2, paddingBottom: space.xl, gap: 6 },
  photo: { aspectRatio: 1 },
});
