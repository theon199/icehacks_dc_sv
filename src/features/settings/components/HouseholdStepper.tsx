import { StyleSheet, View, type AccessibilityActionEvent } from 'react-native';

import { IconButton, Text, space } from '@/ui';

export const HOUSEHOLD_RANGE = { min: 1, max: 20 } as const;

/** Keeps a household size inside the allowed range. */
export const clampHousehold = (size: number) =>
  Math.min(HOUSEHOLD_RANGE.max, Math.max(HOUSEHOLD_RANGE.min, size));

const describe = (size: number) => `${size} ${size === 1 ? 'person' : 'people'}`;

/** VoiceOver swipe gestures mapped to the amount they move the count. */
const swipeDelta: Readonly<Record<string, number>> = { increment: 1, decrement: -1 };

export interface HouseholdStepperProps {
  value: number;
  onChange: (value: number) => void;
}

/** "How many people do you usually cook for?" as a minus / count / plus row. */
export function HouseholdStepper({ value, onChange }: HouseholdStepperProps) {
  const step = (delta: number) => {
    const next = clampHousehold(value + delta);
    if (next !== value) onChange(next);
  };

  const onSwipe = ({ nativeEvent }: AccessibilityActionEvent) => {
    const delta = swipeDelta[nativeEvent.actionName];
    if (delta != null) step(delta);
  };

  const text = describe(value);
  return (
    <View style={styles.group}>
      <Text variant="headline">Household size</Text>
      <View
        style={styles.row}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Household size"
        accessibilityValue={{ text }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onSwipe}
      >
        <IconButton
          testID="household-minus"
          icon="minus"
          variant="tinted"
          accessibilityLabel="Fewer people"
          disabled={value <= HOUSEHOLD_RANGE.min}
          onPress={() => step(-1)}
        />
        <Text variant="title3" style={styles.count} testID="household-value">
          {text}
        </Text>
        <IconButton
          testID="household-plus"
          icon="plus"
          variant="tinted"
          accessibilityLabel="More people"
          disabled={value >= HOUSEHOLD_RANGE.max}
          onPress={() => step(1)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  count: { minWidth: 110, textAlign: 'center' },
});
