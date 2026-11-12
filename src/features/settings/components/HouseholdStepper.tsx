import { StyleSheet, View } from 'react-native';

import { IconButton, Text, space } from '@/ui';

export const HOUSEHOLD_RANGE = { min: 1, max: 20 } as const;

export interface HouseholdStepperProps {
  value: number;
  onChange: (value: number) => void;
}

/** "How many people do you usually cook for?" with minus and plus buttons. */
export function HouseholdStepper({ value, onChange }: HouseholdStepperProps) {
  const label = value === 1 ? '1 person' : `${value} people`;
  return (
    <View style={styles.group}>
      <Text variant="headline">Household size</Text>
      <View
        style={styles.row}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Household size"
        accessibilityValue={{ text: label }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'increment') {
            onChange(Math.min(HOUSEHOLD_RANGE.max, value + 1));
          } else if (event.nativeEvent.actionName === 'decrement') {
            onChange(Math.max(HOUSEHOLD_RANGE.min, value - 1));
          }
        }}
      >
        <IconButton
          testID="household-minus"
          icon="minus"
          variant="tinted"
          accessibilityLabel="Fewer people"
          disabled={value <= HOUSEHOLD_RANGE.min}
          onPress={() => onChange(Math.max(HOUSEHOLD_RANGE.min, value - 1))}
        />
        <Text variant="title3" style={styles.value} testID="household-value">
          {label}
        </Text>
        <IconButton
          testID="household-plus"
          icon="plus"
          variant="tinted"
          accessibilityLabel="More people"
          disabled={value >= HOUSEHOLD_RANGE.max}
          onPress={() => onChange(Math.min(HOUSEHOLD_RANGE.max, value + 1))}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  value: { minWidth: 110, textAlign: 'center' },
});
