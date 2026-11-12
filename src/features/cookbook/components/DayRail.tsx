import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

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

/** Monday-to-Sunday strip; a dot marks days that already have meals. */
export const DayRail = memo(function DayRail({ days, selected, counts, onSelect }: DayRailProps) {
  const theme = useTheme();
  return (
    <View style={styles.rail} accessibilityRole="tablist" accessibilityLabel="Day">
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
    </View>
  );
});

const styles = StyleSheet.create({
  rail: { flexDirection: 'row', justifyContent: 'space-between', gap: space.xxs },
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
