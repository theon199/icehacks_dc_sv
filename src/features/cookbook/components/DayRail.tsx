import { memo } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import type { DayIndex } from '@/domain/plan';
import { haptics } from '@/lib/haptics';
import { minTouchTarget, PressableScale, space, Text, useTheme } from '@/ui';

import type { DayInfo } from '../model/week';

export interface DayRailProps {
  days: readonly DayInfo[];
  selected: DayIndex;
  /** Planned meals per day, Monday first. */
  counts: readonly number[];
  onSelect: (day: DayIndex) => void;
}

/** Room for a two-digit day number in the headline style at the default text size. */
const DAY_NUMBER_WIDTH = 30;

/**
 * Monday-to-Sunday strip; a dot marks days that already have meals. Each day keeps at least a
 * 44pt target that grows with the text size; when seven of them no longer fit the width (narrow
 * phones, large Dynamic Type) the strip scrolls sideways instead of squeezing them.
 */
export const DayRail = memo(function DayRail({ days, selected, counts, onSelect }: DayRailProps) {
  const theme = useTheme();
  const { fontScale } = useWindowDimensions();
  const cellWidth = Math.max(minTouchTarget, Math.ceil(DAY_NUMBER_WIDTH * fontScale) + space.md);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
      accessibilityRole="tablist"
      accessibilityLabel="Day"
    >
      {days.map((d) => {
        const isSelected = d.day === selected;
        const count = counts[d.day] ?? 0;
        const mealsText =
          count === 0 ? 'nothing planned' : count === 1 ? '1 meal' : `${count} meals`;
        return (
          <PressableScale
            key={d.day}
            accessibilityRole="tab"
            accessibilityLabel={`${d.long}${d.isToday ? ', today' : ''}, ${mealsText}`}
            accessibilityState={{ selected: isSelected }}
            onPress={() => {
              if (isSelected) return;
              haptics.selection();
              onSelect(d.day);
            }}
            testID={`day-${d.day}`}
            style={[
              styles.day,
              {
                minWidth: cellWidth,
                borderRadius: theme.radii.md,
                backgroundColor: isSelected ? theme.colors.primary : 'transparent',
                borderColor: d.isToday && !isSelected ? theme.colors.primary : 'transparent',
              },
            ]}
          >
            <Text variant="caption" color={isSelected ? 'onPrimary' : 'textMuted'}>
              {d.short}
            </Text>
            <Text
              variant="headline"
              color={isSelected ? 'onPrimary' : d.isPast ? 'textSubtle' : 'text'}
            >
              {d.dayOfMonth}
            </Text>
            <View
              style={[
                styles.dot,
                {
                  backgroundColor:
                    count === 0
                      ? 'transparent'
                      : isSelected
                        ? theme.colors.onPrimary
                        : theme.colors.accent,
                },
              ]}
            />
          </PressableScale>
        );
      })}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  rail: { flexGrow: 1, flexDirection: 'row', justifyContent: 'space-between', gap: space.xxs },
  day: {
    flex: 1,
    minHeight: minTouchTarget + space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xxs,
    borderWidth: 1.5,
    paddingVertical: space.xs,
  },
  dot: { width: 5, height: 5, borderRadius: 3 },
});
