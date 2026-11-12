import { StyleSheet, View } from 'react-native';

import { ChoiceChip, Text, space } from '@/ui';

export interface ChoiceGroupProps<T extends string | number> {
  title: string;
  hint?: string;
  options: readonly (readonly [T, string])[];
  selected: readonly T[];
  onToggle: (value: T, next: boolean) => void;
  /** Single choice: chips read as radio buttons. */
  single?: boolean;
  /** Disables unselected chips, e.g. when a maximum is reached. */
  full?: boolean;
  testID?: string;
}

/** A labelled, wrapping group of choice chips. */
export function ChoiceGroup<T extends string | number>({
  title,
  hint,
  options,
  selected,
  onToggle,
  single = false,
  full = false,
  testID,
}: ChoiceGroupProps<T>) {
  return (
    <View style={styles.group} testID={testID}>
      <View style={styles.heading}>
        <Text variant="headline">{title}</Text>
        {hint ? (
          <Text variant="footnote" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      <View
        style={styles.chips}
        accessibilityRole={single ? 'radiogroup' : 'none'}
        accessibilityLabel={title}
      >
        {options.map(([value, label]) => {
          const isSelected = selected.includes(value);
          return (
            <ChoiceChip
              key={String(value)}
              {...(testID ? { testID: `${testID}-${String(value)}` } : {})}
              label={label}
              selected={isSelected}
              mode={single ? 'radio' : 'checkbox'}
              disabled={full && !isSelected}
              onToggle={(next) => onToggle(value, next)}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  heading: { gap: space.xxs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
