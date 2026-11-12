import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { UnitSystem } from '@/domain/units';
import { IconButton, SegmentedControl, Text, space, useTheme } from '@/ui';

import { MAX_SERVINGS, MIN_SERVINGS } from '../model/ingredients';

const UNIT_SEGMENTS = [
  { value: 'us', label: 'US' },
  { value: 'metric', label: 'Metric' },
] as const;

export interface ServingsControlProps {
  servings: number;
  onChange: (servings: number) => void;
  units: UnitSystem;
  onUnitsChange: (units: UnitSystem) => void;
  /** Small appetite mode: every serving is a half portion. */
  halfPortions: boolean;
  ownedCount: number;
  ingredientCount: number;
}

/** Servings stepper and unit system toggle above the ingredient list. */
export const ServingsControl = memo(function ServingsControl({
  servings,
  onChange,
  units,
  onUnitsChange,
  halfPortions,
  ownedCount,
  ingredientCount,
}: ServingsControlProps) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Servings"
          accessibilityValue={{ now: servings, min: MIN_SERVINGS, max: MAX_SERVINGS }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'increment') onChange(servings + 1);
            if (event.nativeEvent.actionName === 'decrement') onChange(servings - 1);
          }}
          style={[
            styles.stepper,
            { backgroundColor: theme.colors.surfaceSunken, borderRadius: theme.radii.pill },
          ]}
        >
          <IconButton
            icon="minus"
            accessibilityLabel="Fewer servings"
            onPress={() => onChange(servings - 1)}
            disabled={servings <= MIN_SERVINGS}
            size={36}
          />
          <Text variant="headline" style={styles.count} testID="recipe-servings">
            {servings}
          </Text>
          <IconButton
            icon="plus"
            accessibilityLabel="More servings"
            onPress={() => onChange(servings + 1)}
            disabled={servings >= MAX_SERVINGS}
            size={36}
          />
        </View>
        <SegmentedControl
          segments={UNIT_SEGMENTS}
          value={units}
          onChange={onUnitsChange}
          accessibilityLabel="Units"
          style={styles.units}
        />
      </View>
      <Text variant="footnote" tone="muted">
        {servings === 1 ? '1 serving' : `${servings} servings`}
        {halfPortions ? ' · half portions for a small appetite' : ''}
        {ownedCount > 0 ? ` · you have ${ownedCount} of ${ingredientCount}` : ''}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stepper: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xs },
  count: { minWidth: 32, textAlign: 'center' },
  units: { flex: 1 },
});
