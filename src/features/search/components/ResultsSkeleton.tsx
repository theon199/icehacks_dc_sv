import { StyleSheet, View } from 'react-native';

import { Skeleton } from '@/ui';
import { space } from '@/ui/tokens';

import { ROW_THUMB } from './SearchRows';

const ROWS = [0, 1, 2, 3, 4];

/** Placeholder rows while the first page of results loads, shaped like the recipe rows. */
export function ResultsSkeleton() {
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading recipes">
      {ROWS.map((row) => (
        <View key={row} style={styles.row}>
          <Skeleton width={ROW_THUMB} height={ROW_THUMB} radius="md" />
          <View style={styles.lines}>
            <Skeleton width="70%" height={16} />
            <Skeleton width="45%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60 },
  lines: { flex: 1, gap: space.xs + 2 },
});
