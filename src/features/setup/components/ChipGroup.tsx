import { StyleSheet, View } from 'react-native';

import { ChoiceChip, type IconName } from '@/ui';

export interface ChipGroupItem<T extends string> {
  id: T;
  label: string;
  icon?: IconName;
}

export interface ChipGroupProps<T extends string> {
  items: readonly ChipGroupItem<T>[];
  selected: readonly T[];
  onToggle: (id: T, on: boolean) => void;
  /** Disables unselected chips, e.g. once a maximum is reached. */
  locked?: boolean;
  testIDPrefix?: string;
}

/** Wrapping row of multi-select chips. */
export function ChipGroup<T extends string>({
  items,
  selected,
  onToggle,
  locked = false,
  testIDPrefix,
}: ChipGroupProps<T>) {
  return (
    <View style={styles.wrap}>
      {items.map((item) => {
        const isOn = selected.includes(item.id);
        return (
          <ChoiceChip
            key={item.id}
            label={item.label}
            selected={isOn}
            disabled={locked && !isOn}
            onToggle={(next) => onToggle(item.id, next)}
            {...(item.icon ? { icon: item.icon } : {})}
            {...(testIDPrefix ? { testID: `${testIDPrefix}-${item.id}` } : {})}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
