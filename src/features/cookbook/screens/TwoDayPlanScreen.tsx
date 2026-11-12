import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { addDays, type PlanDaysResult } from '@/domain/plan';
import { useRecipes, type RecipeSummary } from '@/lib/catalog';
import { formatNumber } from '@/lib/format';
import { usePreferencesStore } from '@/stores';
import {
  Button,
  ErrorState,
  ListRow,
  ProgressRing,
  Screen,
  space,
  Text,
  toast,
  Toggle,
} from '@/ui';

import { PlannedDayCard } from '../components/PlannedDayCard';
import { PlanStatus } from '../components/PlanStatus';
import { plannerActions } from '../hooks/usePlanner';
import { useToday } from '../hooks/useToday';
import { useTwoDayPlan } from '../hooks/useTwoDayPlan';
import { dayPlanWrites } from '../model/dayPlan';
import { weekDays, locateDate } from '../model/week';

/**
 * Two days of meals chosen to land close to the person's daily nutrition targets. The search runs
 * a slice per frame with visible progress; the result can be copied into the weekly planner.
 */
export function TwoDayPlanScreen() {
  const today = useToday();
  const prefs = usePreferencesStore((s) => s.prefs);
  const [smallAppetite, setSmallAppetite] = useState(prefs.smallAppetite);
  const state = useTwoDayPlan(smallAppetite);
  const result =
    state.status === 'planning' && state.plan.phase === 'done' ? state.plan.result : null;

  const onAdd = (plan: PlanDaysResult) => {
    const placed = dayPlanWrites(plan, today, prefs.householdSize).reduce(
      (sum, { week, writes }) => sum + plannerActions.applyWrites(week, writes),
      0,
    );
    toast.show({
      message:
        placed === 0
          ? 'Those meals are already planned'
          : placed === 1
            ? 'Added 1 meal to your plan'
            : `Added ${placed} meals to your plan`,
      tone: placed > 0 ? 'success' : 'neutral',
    });
    router.back();
  };

  return (
    <Screen
      testID="two-day-plan-screen"
      footer={
        result ? (
          <Button
            label="Add to planner"
            onPress={() => onAdd(result)}
            fullWidth
            accessibilityHint="Fills empty meals for today and tomorrow"
            testID="add-two-day"
          />
        ) : undefined
      }
    >
      <View style={styles.intro}>
        <Text variant="callout" tone="muted">
          Meals for today and tomorrow, balanced against your daily targets for energy, protein,
          fiber, sodium, saturated fat and added sugar.
        </Text>
      </View>
      <Toggle
        label="Plan small meals"
        description="Half portions with two snacks a day"
        value={smallAppetite}
        onValueChange={setSmallAppetite}
        testID="two-day-small"
      />
      {state.status !== 'planning' ? (
        <PlanStatus state={state} loadingLabel="Getting recipes ready" />
      ) : state.plan.phase === 'running' || state.plan.phase === 'idle' ? (
        <Progress value={state.plan.phase === 'running' ? state.plan.progress : 0} />
      ) : state.plan.phase === 'error' ? (
        <ErrorState title="Could not build a plan" error={state.plan.error} />
      ) : (
        <PlanResult result={state.plan.result} targets={state.targets} today={today} />
      )}
    </Screen>
  );
}

function Progress({ value }: { value: number }) {
  const percent = Math.round(value * 100);
  return (
    <View style={styles.progress} testID="two-day-progress">
      <ProgressRing
        progress={value}
        size={96}
        strokeWidth={8}
        accessibilityLabel="Planning progress"
      >
        <Text variant="headline">{`${percent}%`}</Text>
      </ProgressRing>
      <Text variant="callout" tone="muted" align="center">
        Balancing meals against your targets…
      </Text>
    </View>
  );
}

function PlanResult({
  result,
  targets,
  today,
}: {
  result: PlanDaysResult;
  targets: Parameters<typeof PlannedDayCard>[0]['targets'];
  today: string;
}) {
  const ids = useMemo(
    () => [
      ...new Set(
        result.days.flatMap((d) => d.meals.flatMap((m) => (m.recipeId ? [m.recipeId] : []))),
      ),
    ],
    [result],
  );
  const summaries = useRecipes(ids);
  const recipes = useMemo(
    () => new Map<string, RecipeSummary>((summaries.data ?? []).map((r) => [r.id, r])),
    [summaries.data],
  );
  const estimated = result.explanation.some((n) => n.kind === 'estimated');
  return (
    <View style={styles.result} testID="two-day-result">
      {result.days.map((day) => {
        const date = addDays(today, day.index);
        const { week, day: index } = locateDate(date);
        const info = weekDays(week, today)[index];
        return (
          <PlannedDayCard
            key={day.index}
            day={day}
            dateLabel={info?.long ?? date}
            weekday={info?.weekday ?? ''}
            targets={targets}
            recipes={recipes}
          />
        );
      })}
      <Text variant="footnote" tone="muted">
        {targets.basis === 'personal'
          ? `Targets come from your personal details: about ${formatNumber(targets.kcal, 0)} kcal a day.`
          : `Targets use the 2,000 kcal reference day. Add personal details for targets that fit you.`}
      </Text>
      {estimated ? (
        <Text variant="footnote" tone="muted">
          Some nutrition values are estimated rather than computed from USDA data.
        </Text>
      ) : null}
      {targets.basis === 'personal' ? null : (
        <ListRow
          title="Personal details"
          icon="person.crop.circle"
          onPress={() => router.push('/personal-details')}
        />
      )}
      <Text variant="caption" tone="subtle">
        For general information only, not medical advice.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space.sm },
  progress: { alignItems: 'center', gap: space.lg, paddingVertical: space.xxl },
  result: { gap: space.lg },
});
