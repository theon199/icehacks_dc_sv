import { StyleSheet, View } from 'react-native';

import type { SnapDish } from '@/lib/api/ai';
import { Card, radii, space, Text, useTheme } from '@/ui';

import { CERTAINTY_LABELS, certaintyOf, formatRange } from '../logic/estimate';

const ROWS = [
  { key: 'protein_g', label: 'Protein', unit: 'g' },
  { key: 'carbs_g', label: 'Carbs', unit: 'g' },
  { key: 'fat_g', label: 'Fat', unit: 'g' },
  { key: 'fiber_g', label: 'Fiber', unit: 'g' },
  { key: 'sodium_mg', label: 'Sodium', unit: 'mg' },
] as const;

/** Estimated nutrition for the plate, always with its range and how rough it is. */
export function NutritionEstimateCard({ dish }: { dish: SnapDish }) {
  const theme = useTheme();
  const certainty = certaintyOf(dish);
  return (
    <Card testID="dish-nutrition">
      <View style={styles.stack}>
        <View style={styles.titleRow}>
          <Text variant="overline" tone="muted">
            Estimated nutrition
          </Text>
          <View
            style={[styles.pill, { backgroundColor: theme.colors.warningSoft }]}
            accessible
            accessibilityLabel={`Certainty: ${CERTAINTY_LABELS[certainty]}`}
          >
            <Text variant="caption" color="onWarningSoft">
              {CERTAINTY_LABELS[certainty]}
            </Text>
          </View>
        </View>
        <Text variant="title2">{formatRange(dish.nutrition.kcal, 'kcal')}</Text>
        {dish.portion ? (
          <Text variant="footnote" tone="muted">
            {`For ${dish.portion}`}
          </Text>
        ) : null}
        <View style={styles.grid}>
          {ROWS.map((row) => (
            <View key={row.key} style={styles.cell}>
              <Text variant="caption" tone="muted">
                {row.label}
              </Text>
              <Text variant="subhead">{formatRange(dish.nutrition[row.key], row.unit)}</Text>
            </View>
          ))}
        </View>
        <Text variant="footnote" tone="subtle">
          Estimated from a photo, not measured. Real values depend on the recipe, oil and portion.
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.sm },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pill: { paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radii.pill },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.sm },
  cell: { width: '50%', gap: space.xxs },
});
