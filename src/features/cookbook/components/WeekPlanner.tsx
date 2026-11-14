import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import type { IsoDate } from '@/domain/plan';
import { haptics } from '@/lib/haptics';
import { Button, fontFamily, gutter, PressableScale, space, Text, useTheme } from '@/ui';

import { DayRail } from './DayRail';
import { WeekPager } from './WeekPager';
import { plannerActions } from '../hooks/usePlanner';
import type { PlannerWeek } from '../hooks/usePlannerWeek';

export interface WeekPlannerProps {
  today: IsoDate;
  planner: PlannerWeek;
}

/** Fixed height of the page's wide pill buttons. */
const PILL_HEIGHT = 52;

/**
 * The top of the Cookbook: the week pager and day strip, the week's groceries, any notice about
 * archived weeks, then the week's days as a rail of cards.
 */
export function WeekPlanner({ today, planner }: WeekPlannerProps) {
  const theme = useTheme();
  const { weekStart, day, archived, pastActive } = planner;
  return (
    <View style={styles.root} testID="week-planner">
      <WeekPager
        today={today}
        weekStart={weekStart}
        day={day}
        onWeekChange={planner.goToWeek}
        onSelectDay={planner.setDay}
        onToday={planner.goToToday}
      />
      <View style={styles.gutter}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Groceries for this week"
          accessibilityHint="Opens the shopping list for the rest of this week"
          onPress={() => {
            haptics.impact('light');
            router.push('/shopping');
          }}
          style={[
            styles.pill,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radii.pill,
            },
          ]}
          testID="plan-groceries"
        >
          <Text variant="body" style={styles.bold} numberOfLines={1}>
            Groceries for this week
          </Text>
        </PressableScale>
      </View>
      {pastActive ? (
        <Notice
          text="Earlier weeks still have meals. Archive them to keep the planner tidy."
          action="Archive"
          onPress={() => plannerActions.archivePast()}
          testID="archive-past"
        />
      ) : null}
      {archived ? (
        <Notice
          text="This week is archived. Restore it to make changes."
          action="Restore"
          onPress={() => plannerActions.restore(weekStart)}
          testID="restore-week"
        />
      ) : null}
      <DayRail
        weekStart={weekStart}
        today={today}
        days={planner.days}
        day={day}
        onDayChange={planner.setDay}
        slots={planner.slots}
        recipes={planner.recipes}
        readOnly={archived}
        smallAppetite={planner.smallAppetite}
        moveWeeks={planner.moveWeeks}
        isSafe={planner.isSafe}
      />
    </View>
  );
}

function Notice({
  text,
  action,
  onPress,
  testID,
}: {
  text: string;
  action: string;
  onPress: () => void;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.gutter}>
      <View
        style={[
          styles.notice,
          { backgroundColor: theme.colors.warningSoft, borderRadius: theme.radii.card },
        ]}
      >
        <Text variant="subhead" color="onWarningSoft" style={styles.flex}>
          {text}
        </Text>
        <Button label={action} size="sm" variant="secondary" onPress={onPress} testID={testID} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  gutter: { paddingHorizontal: gutter },
  pill: {
    minHeight: PILL_HEIGHT,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  bold: { fontFamily: fontFamily.textBold },
  notice: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  flex: { flex: 1 },
});
