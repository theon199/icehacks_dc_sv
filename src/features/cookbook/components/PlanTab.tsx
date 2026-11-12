import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { addDays, weekStartOf, type DayIndex, type IsoDate } from '@/domain/plan';
import { useRecipes, type RecipeSummary } from '@/lib/catalog';
import { plannedRecipeIds, usePreferencesStore } from '@/stores';
import { Button, Card, gutter, ListRow, space, Text } from '@/ui';

import { WeekCostSummary } from '../deps';
import { DayMeals } from './DayMeals';
import { DayRail } from './DayRail';
import { PlanWeekMenu } from './PlanWeekMenu';
import { WeekHeader } from './WeekHeader';
import {
  plannerActions,
  useArchivedCount,
  useIsWeekArchived,
  usePastActiveWeeks,
  useWeekSlots,
} from '../hooks/usePlanner';
import { initialDay, mealsPerDay, remainingDays, weekDays } from '../model/week';

export interface PlanTabProps {
  header: ReactNode;
  today: IsoDate;
}

const SWIPE_DISTANCE = 60;

/** The weekly planner: week pager, day rail and the selected day's meals. */
export function PlanTab({ header, today }: PlanTabProps) {
  const currentWeek = weekStartOf(today);
  const [weekStart, setWeekStart] = useState(currentWeek);
  const [day, setDay] = useState<DayIndex>(() => initialDay(currentWeek, today));
  const slots = useWeekSlots(weekStart);
  const archived = useIsWeekArchived(weekStart);
  const pastActive = usePastActiveWeeks(today);
  const archivedCount = useArchivedCount();
  const smallAppetite = usePreferencesStore((s) => s.prefs.smallAppetite);

  const days = useMemo(() => weekDays(weekStart, today), [weekStart, today]);
  const counts = useMemo(() => mealsPerDay(slots), [slots]);
  const ids = useMemo(
    () => plannedRecipeIds({ weekStart, slots, archivedAt: null }),
    [weekStart, slots],
  );
  const planned = useRecipes(ids);
  const recipes = useMemo(
    () => new Map<string, RecipeSummary>((planned.data ?? []).map((r) => [r.id, r])),
    [planned.data],
  );
  const canAutoFill = !archived && remainingDays(weekStart, today).length > 0;

  const goToWeek = (week: IsoDate, nextDay?: DayIndex) => {
    setWeekStart(week);
    setDay(nextDay ?? initialDay(week, today));
  };
  const step = (delta: 1 | -1) => {
    const next = day + delta;
    if (next < 0) goToWeek(addDays(weekStart, -7), 6);
    else if (next > 6) goToWeek(addDays(weekStart, 7), 0);
    else setDay(next as DayIndex);
  };
  const swipe = Gesture.Pan()
    .activeOffsetX([-24, 24])
    .failOffsetY([-16, 16])
    .runOnJS(true)
    .onEnd((e) => {
      if (e.translationX <= -SWIPE_DISTANCE) step(1);
      else if (e.translationX >= SWIPE_DISTANCE) step(-1);
    });

  const info = days[day] ?? days[0];
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      testID="plan-tab"
    >
      {header}
      <WeekHeader
        weekStart={weekStart}
        today={today}
        isCurrentWeek={weekStart === currentWeek}
        onPrevious={() => goToWeek(addDays(weekStart, -7))}
        onNext={() => goToWeek(addDays(weekStart, 7))}
        onToday={() => goToWeek(currentWeek)}
      />
      <DayRail days={days} selected={day} counts={counts} onSelect={setDay} />
      {pastActive ? (
        <Card variant="sunken" padding="md" style={styles.banner}>
          <Text variant="footnote" tone="muted" style={styles.flex}>
            Earlier weeks still have meals. Archive them to keep the planner tidy.
          </Text>
          <Button
            label="Archive"
            size="sm"
            variant="secondary"
            onPress={() => plannerActions.archivePast()}
            testID="archive-past"
          />
        </Card>
      ) : null}
      {archived ? (
        <Card variant="sunken" padding="md" style={styles.banner}>
          <Text variant="footnote" tone="muted" style={styles.flex}>
            This week is archived. Restore it to make changes.
          </Text>
          <Button
            label="Restore"
            size="sm"
            variant="secondary"
            onPress={() => plannerActions.restore(weekStart)}
            testID="restore-week"
          />
        </Card>
      ) : null}
      {canAutoFill ? (
        <View style={styles.tools}>
          <Button
            label="Plan my week"
            icon="wand.and.stars"
            onPress={() =>
              router.push({ pathname: '/cookbook/plan-week', params: { week: weekStart } })
            }
            style={styles.flex}
            testID="plan-my-week"
          />
          <Button
            label="Two-day plan"
            icon="chart.bar"
            variant="secondary"
            onPress={() => router.push('/cookbook/two-day-plan')}
            style={styles.flex}
            testID="two-day-plan"
          />
        </View>
      ) : null}
      {info ? (
        <GestureDetector gesture={swipe}>
          <View collapsable={false}>
            <DayMeals
              key={`${weekStart}:${info.day}`}
              weekStart={weekStart}
              today={today}
              info={info}
              slots={slots}
              recipes={recipes}
              readOnly={archived}
              smallPortions={smallAppetite}
              moveWeeks={[weekStart, addDays(weekStart, 7)]}
            />
          </View>
        </GestureDetector>
      ) : null}
      <WeekCostSummary recipeIds={ids} />
      <View>
        <ListRow
          title="Shopping list"
          subtitle="Everything this plan needs"
          icon="cart"
          onPress={() => router.push('/shopping')}
          divider
        />
        <ListRow
          title="Archived weeks"
          icon="archivebox"
          {...(archivedCount > 0 ? { value: String(archivedCount) } : {})}
          onPress={() => router.push('/cookbook/archive')}
          divider
        />
        <PlanWeekMenu weekStart={weekStart} hasMeals={ids.length > 0} archived={archived} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: gutter,
    paddingTop: space.sm,
    paddingBottom: space.xxxl,
    gap: space.lg,
  },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  tools: { flexDirection: 'row', gap: space.sm },
  flex: { flex: 1 },
});
