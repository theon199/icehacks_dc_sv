import { StyleSheet, View } from 'react-native';

import { IconButton, Text } from '@/ui';

import { StepHeader } from '../components/StepHeader';
import { MAX_HOUSEHOLD, clampHousehold } from '../onboardingModel';
import type { StepProps } from './types';

function peopleLabel(size: number): string {
  return size === 1 ? 'Just me' : `${size} people`;
}

export function HouseholdStep({ draft, onChange }: StepProps) {
  const size = draft.householdSize;
  const set = (next: number) => onChange({ ...draft, householdSize: clampHousehold(next) });
  return (
    <>
      <StepHeader
        title="How many people do you cook for?"
        description="Servings and shopping lists scale to this."
      />
      <View
        style={styles.row}
        accessibilityRole="adjustable"
        accessibilityLabel="Household size"
        accessibilityValue={{ text: peopleLabel(size) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'increment') set(size + 1);
          if (event.nativeEvent.actionName === 'decrement') set(size - 1);
        }}
      >
        <IconButton
          testID="household-minus"
          icon="minus"
          variant="tinted"
          size={52}
          accessibilityLabel="Fewer people"
          disabled={size <= 1}
          onPress={() => set(size - 1)}
        />
        <View style={styles.value}>
          <Text variant="display" align="center" testID="household-size">
            {size}
          </Text>
          <Text variant="subhead" tone="muted" align="center">
            {peopleLabel(size)}
          </Text>
        </View>
        <IconButton
          testID="household-plus"
          icon="plus"
          variant="tinted"
          size={52}
          accessibilityLabel="More people"
          disabled={size >= MAX_HOUSEHOLD}
          onPress={() => set(size + 1)}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
  value: { minWidth: 96 },
});
