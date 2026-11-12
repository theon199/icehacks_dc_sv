import { StyleSheet, View } from 'react-native';

import { formatNumber } from '@/lib/format';
import { space, Text, useTheme } from '@/ui';

import type { NutrientRow } from '../model/dayPlan';

/** One nutrient of a planned day against its target, as a labelled bar. */
export function NutrientBar({ row }: { row: NutrientRow }) {
  const theme = useTheme();
  const fill = Math.min(1, Math.max(0, row.ratio));
  const value = `${formatNumber(row.value, 0)} ${row.unit}`;
  const target = `${formatNumber(row.target, 0)} ${row.unit}`;
  return (
    <View
      style={styles.root}
      accessible
      accessibilityLabel={`${row.label}: ${value} of a ${target} ${row.noun}. ${row.statusText}.`}
      testID={`nutrient-${row.nutrient}`}
    >
      <View style={styles.labels}>
        <Text variant="footnote" style={styles.flex}>
          {row.label}
        </Text>
        <Text variant="footnote" tone="muted">
          {`${value} / ${target}`}
        </Text>
      </View>
      <View
        style={[
          styles.track,
          { backgroundColor: theme.colors.surfaceSunken, borderRadius: theme.radii.pill },
        ]}
      >
        <View
          style={[
            styles.fill,
            {
              width: `${fill * 100}%`,
              borderRadius: theme.radii.pill,
              backgroundColor: row.good ? theme.colors.success : theme.colors.warning,
            },
          ]}
        />
      </View>
      <Text variant="caption" color={row.good ? 'success' : 'warning'}>
        {row.statusText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xxs },
  labels: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  flex: { flex: 1 },
  track: { height: 6, overflow: 'hidden' },
  fill: { height: 6 },
});
