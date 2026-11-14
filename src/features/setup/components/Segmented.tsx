import { StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { PressableScale, Text, radii, space, useTheme } from '@/ui';

export interface SegmentedOption<T> {
  value: T;
  /** Short visible text, e.g. "30". */
  label: string;
  /** What VoiceOver reads, e.g. "30 minutes". */
  accessibilityLabel: string;
  testID?: string;
}

export interface SegmentedProps<T> {
  options: readonly SegmentedOption<T>[];
  /** Undefined while nothing is picked yet. */
  value: T | undefined;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}

/** Equal-width single choice on a grey track; the picked cell is white. */
export function Segmented<T>({ options, value, onChange, accessibilityLabel }: SegmentedProps<T>) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, { backgroundColor: theme.colors.primarySoft }]}
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <PressableScale
            key={option.accessibilityLabel}
            {...(option.testID ? { testID: option.testID } : {})}
            accessibilityRole="radio"
            accessibilityLabel={option.accessibilityLabel}
            accessibilityState={{ checked: on }}
            hitSlop={{ top: space.xs, bottom: space.xs }}
            pressedScale={1}
            pressedOpacity={0.82}
            onPress={() => {
              haptics.selection();
              onChange(option.value);
            }}
            style={[
              styles.cell,
              on
                ? [
                    { backgroundColor: theme.colors.surface, shadowColor: theme.colors.shadow },
                    theme.elevation.low,
                  ]
                : null,
            ]}
          >
            <Text variant="label" tone={on ? 'default' : 'muted'} accessible={false}>
              {option.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: radii.pill, padding: space.xs, gap: 2 },
  cell: {
    flex: 1,
    height: 40,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
