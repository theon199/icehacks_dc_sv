import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { PressableScale, Text, radii, space, useTheme } from '@/ui';

export interface ChipGroupItem<T extends string> {
  id: T;
  label: string;
}

export interface ChipGroupProps<T extends string> {
  items: readonly ChipGroupItem<T>[];
  selected: readonly T[];
  onToggle: (id: T, on: boolean) => void;
  /** Disables unselected chips, e.g. once a maximum is reached. */
  locked?: boolean;
  /** A chip that leads the row with its own behaviour, e.g. "No food allergies". */
  leading?: ReactNode;
  testIDPrefix?: string;
}

/** Wrapping row of multi-select chips: white with a hairline, ink when picked. */
export function ChipGroup<T extends string>({
  items,
  selected,
  onToggle,
  locked = false,
  leading,
  testIDPrefix,
}: ChipGroupProps<T>) {
  return (
    <View style={styles.wrap}>
      {leading}
      {items.map((item) => {
        const on = selected.includes(item.id);
        return (
          <SelectChip
            key={item.id}
            label={item.label}
            on={on}
            disabled={locked && !on}
            onToggle={(next) => onToggle(item.id, next)}
            {...(testIDPrefix ? { testID: `${testIDPrefix}-${item.id}` } : {})}
          />
        );
      })}
    </View>
  );
}

export interface SelectChipProps {
  label: string;
  on: boolean;
  onToggle: (next: boolean) => void;
  disabled?: boolean;
  testID?: string;
}

/** One answer chip. Picking changes only its colours, never its size. */
export const SelectChip = memo(function SelectChip({
  label,
  on,
  onToggle,
  disabled = false,
  testID,
}: SelectChipProps) {
  const theme = useTheme();
  return (
    <PressableScale
      {...(testID ? { testID } : {})}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: on, disabled }}
      disabled={disabled}
      hitSlop={{ top: 2, bottom: 2 }}
      pressedOpacity={0.82}
      onPress={() => {
        haptics.selection();
        onToggle(!on);
      }}
      style={[
        styles.chip,
        {
          backgroundColor: on ? theme.colors.primary : theme.colors.surface,
          borderColor: on ? theme.colors.primary : theme.colors.border,
          shadowColor: theme.colors.shadow,
        },
        theme.elevation.low,
        disabled ? styles.disabled : null,
      ]}
    >
      <Text variant="label" color={on ? 'onPrimary' : 'text'} accessible={false}>
        {label}
      </Text>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    height: 40,
    paddingHorizontal: space.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
});
