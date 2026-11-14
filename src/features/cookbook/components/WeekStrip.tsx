import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { DayIndex } from '@/domain/plan';
import { haptics } from '@/lib/haptics';
import { fontFamily, PressableScale, space, Text, useTheme } from '@/ui';

import { WEEK_STRIP_HEIGHT } from './plannerLayout';
import { plannedSummary, type DayInfo } from '../model/week';

export interface WeekStripProps {
  days: readonly DayInfo[];
  /** The day shown in the card rail below. */
  selected: DayIndex;
  /** Planned meals per day, Monday first. */
  counts: readonly number[];
  onSelect: (day: DayIndex) => void;
}

/**
 * Monday to Sunday in one row: the day in view is an ink tile, today's initial is ink, and a dot
 * marks a day with meals (lime on the ink tile). Every week's strip has the same fixed height, so
 * paging between weeks never nudges the cards below.
 */
export const WeekStrip = memo(function WeekStrip({
  days,
  selected,
  counts,
  onSelect,
}: WeekStripProps) {
  const theme = useTheme();
  return (
    <View style={styles.strip} accessibilityRole="tablist" accessibilityLabel="Day">
      {days.map((d) => {
        const active = d.day === selected;
        const count = counts[d.day] ?? 0;
        const dot =
          count === 0 ? 'transparent' : active ? theme.colors.highlight : theme.colors.primary;
        return (
          <PressableScale
            key={d.date}
            accessibilityRole="tab"
            accessibilityLabel={`${d.long}${d.isToday ? ', today' : ''}, ${plannedSummary(count).toLowerCase()}`}
            accessibilityState={{ selected: active }}
            onPress={() => {
              haptics.selection();
              onSelect(d.day);
            }}
            testID={`day-${d.date}`}
            style={[
              styles.day,
              {
                borderRadius: theme.radii.md,
                backgroundColor: active ? theme.colors.primary : 'transparent',
              },
            ]}
          >
            <Text
              variant="caption"
              color={active ? 'onPrimary' : d.isToday ? 'text' : 'textMuted'}
              style={styles.bold}
              maxFontSizeMultiplier={1.3}
            >
              {d.short.charAt(0)}
            </Text>
            <Text
              variant="label"
              color={active ? 'onPrimary' : 'text'}
              style={styles.bold}
              maxFontSizeMultiplier={1.3}
            >
              {d.dayOfMonth}
            </Text>
            <View style={[styles.dot, { backgroundColor: dot }]} />
          </PressableScale>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: space.xs },
  day: {
    flex: 1,
    height: WEEK_STRIP_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  bold: { fontFamily: fontFamily.textBold },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: space.xxs },
});
