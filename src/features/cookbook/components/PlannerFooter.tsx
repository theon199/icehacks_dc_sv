import { router } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { gutter, space, toast } from '@/ui';

import { LinkCard } from './LinkCard';
import { CostSummary } from '../deps';
import { plannerActions } from '../hooks/usePlanner';
import type { PlannerWeek } from '../hooks/usePlannerWeek';

export interface PlannerFooterProps {
  planner: PlannerWeek;
}

function archivedText(count: number): string {
  if (count === 0) return 'No archived weeks yet';
  return count === 1 ? '1 archived week' : `${count} archived weeks`;
}

/**
 * The end of the Cookbook page: the archive, the planning tools for the week in view, whole-week
 * actions and the week's estimated cost. Each is a row card in the same spot as the page's other
 * ways onward.
 */
export function PlannerFooter({ planner }: PlannerFooterProps) {
  const { weekStart, archived, canAutoFill, archivedCount, costRecipes } = planner;
  const hasMeals = planner.ids.length > 0;

  const archiveWeek = () => {
    plannerActions.archive(weekStart);
    toast.show({
      message: 'Week archived',
      action: { label: 'Undo', onPress: () => plannerActions.restore(weekStart) },
    });
  };
  const clearWeek = () =>
    Alert.alert('Clear this week?', 'Every meal planned for this week will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear week',
        style: 'destructive',
        onPress: () => plannerActions.clearWeek(weekStart),
      },
    ]);

  return (
    <View style={styles.root}>
      <LinkCard
        title="Archived weeks"
        subtitle={archivedText(archivedCount)}
        icon="archivebox"
        onPress={() => router.push('/cookbook/archive')}
        testID="archived-weeks"
      />
      {canAutoFill ? (
        <>
          <LinkCard
            title="Plan my week"
            subtitle="Fills this week’s empty meals with recipes that fit you."
            icon="wand.and.stars"
            tone="highlight"
            onPress={() =>
              router.push({ pathname: '/cookbook/plan-week', params: { week: weekStart } })
            }
            testID="plan-my-week"
          />
          <LinkCard
            title="Two-day plan"
            subtitle="Two days of meals balanced against your daily targets."
            icon="chart.bar"
            onPress={() => router.push('/cookbook/two-day-plan')}
            testID="two-day-plan"
          />
        </>
      ) : null}
      {hasMeals && !archived ? (
        <>
          <LinkCard
            title="Archive this week"
            subtitle="Keeps its meals, read-only, in Archived weeks."
            icon="archivebox"
            onPress={archiveWeek}
            testID="archive-week"
          />
          <LinkCard
            title="Clear this week"
            subtitle="Removes every meal planned for this week."
            icon="trash"
            tone="danger"
            onPress={clearWeek}
            testID="clear-week"
          />
        </>
      ) : null}
      {costRecipes.length > 0 ? (
        // An archived week is read-only, so it shows what it cost but offers no shopping.
        <CostSummary recipes={costRecipes} hideWalmart={archived} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.md, paddingHorizontal: gutter, paddingTop: space.sm },
});
