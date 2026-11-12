import { StyleSheet, View } from 'react-native';

import type { IsoDate } from '@/domain/plan';
import { Button, IconButton, space, Text } from '@/ui';

import { weekRangeLabel, weekTitle } from '../model/week';

export interface WeekHeaderProps {
  weekStart: IsoDate;
  today: IsoDate;
  onPrevious: () => void;
  onNext: () => void;
  /** Jump back to the current week; hidden while it is shown. */
  onToday: () => void;
  isCurrentWeek: boolean;
}

/** Week pager controls: previous / next week and a jump back to this week. */
export function WeekHeader({
  weekStart,
  today,
  onPrevious,
  onNext,
  onToday,
  isCurrentWeek,
}: WeekHeaderProps) {
  const title = weekTitle(weekStart, today);
  const range = weekRangeLabel(weekStart);
  return (
    <View style={styles.row}>
      <IconButton
        icon="chevron.left"
        accessibilityLabel="Previous week"
        onPress={onPrevious}
        testID="week-previous"
      />
      <View style={styles.title} accessible accessibilityRole="header">
        <Text variant="headline" align="center" testID="week-title">
          {title}
        </Text>
        {title !== range ? (
          <Text variant="footnote" tone="muted" align="center">
            {range}
          </Text>
        ) : null}
      </View>
      <IconButton
        icon="chevron.right"
        accessibilityLabel="Next week"
        onPress={onNext}
        testID="week-next"
      />
      {isCurrentWeek ? null : (
        <Button label="Today" size="sm" variant="secondary" onPress={onToday} haptic={false} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  title: { flex: 1, gap: space.xxs },
});
