import { StyleSheet, View } from 'react-native';

import type { IsoDate } from '@/domain/plan';
import { Button, fontFamily, IconButton, space, Text } from '@/ui';

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

/** The week's name and dates on the left; previous / next week and "Today" on the right. */
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
      <View style={styles.title} accessible accessibilityRole="header">
        <Text variant="title2" style={styles.bold} testID="week-title">
          {title}
        </Text>
        {title !== range ? (
          <Text variant="subhead" tone="muted">
            {range}
          </Text>
        ) : null}
      </View>
      {isCurrentWeek ? null : (
        <Button label="Today" size="sm" variant="secondary" onPress={onToday} haptic={false} />
      )}
      <IconButton
        icon="chevron.left"
        accessibilityLabel="Previous week"
        onPress={onPrevious}
        size={36}
        color="textMuted"
        testID="week-previous"
      />
      <IconButton
        icon="chevron.right"
        accessibilityLabel="Next week"
        onPress={onNext}
        size={36}
        color="textMuted"
        testID="week-next"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  title: { flex: 1, gap: space.xxs },
  bold: { fontFamily: fontFamily.textBold },
});
