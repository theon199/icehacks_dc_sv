import { FlashList } from '@shopify/flash-list';
import { useCallback } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { selectArchivedWeeks, useMealPlanStore, type PlanWeek } from '@/stores';
import { Button, Card, EmptyState, gutter, space, Text, toast } from '@/ui';

import { plannerActions } from '../hooks/usePlanner';
import { weekRangeLabel } from '../model/week';

function mealCount(week: PlanWeek): string {
  const n = Object.keys(week.slots).length;
  return n === 1 ? '1 meal' : `${n} meals`;
}

const ArchivedWeekRow = ({ week }: { week: PlanWeek }) => {
  const range = weekRangeLabel(week.weekStart);
  const remove = () =>
    Alert.alert(`Delete the week of ${range}?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => plannerActions.deleteWeek(week.weekStart),
      },
    ]);
  return (
    <Card variant="outlined" padding="md" style={styles.row} testID={`archived-${week.weekStart}`}>
      <View style={styles.text}>
        <Text variant="headline">{range}</Text>
        <Text variant="footnote" tone="muted">
          {mealCount(week)}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button
          label="Restore"
          size="sm"
          variant="secondary"
          accessibilityHint={`Moves the week of ${range} back into the planner`}
          onPress={() => {
            plannerActions.restore(week.weekStart);
            toast.show({ message: 'Week restored', tone: 'success' });
          }}
          testID={`restore-${week.weekStart}`}
        />
        <Button
          label="Delete"
          size="sm"
          variant="ghost"
          accessibilityHint={`Deletes the week of ${range}`}
          onPress={remove}
          testID={`delete-${week.weekStart}`}
        />
      </View>
    </Card>
  );
};

/** Archived weeks, newest first, each with restore and delete. */
export function ArchiveScreen() {
  const weeks = useMealPlanStore(selectArchivedWeeks);
  const renderItem = useCallback(
    ({ item }: { item: PlanWeek }) => <ArchivedWeekRow week={item} />,
    [],
  );
  return (
    <FlashList
      data={weeks}
      keyExtractor={(w) => w.weekStart}
      renderItem={renderItem}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      ItemSeparatorComponent={Separator}
      ListEmptyComponent={
        <EmptyState
          icon="archivebox"
          title="No archived weeks"
          message="Weeks you archive from the planner are kept here for a year."
        />
      }
      testID="archive-screen"
    />
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  content: { padding: gutter },
  row: { gap: space.md },
  text: { gap: space.xxs },
  actions: { flexDirection: 'row', gap: space.sm },
  separator: { height: space.md },
});
