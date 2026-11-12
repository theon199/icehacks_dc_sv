import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { AutoFillAssignment, FillReason } from '@/domain/plan';
import type { RecipeSummary as DomainRecipeSummary } from '@/domain/types';
import { usePreferencesStore } from '@/stores';
import { Button, Card, Chip, EmptyState, Screen, space, Text, toast, Toggle } from '@/ui';

import { PlanStatus } from '../components/PlanStatus';
import { useAutoFillPreview } from '../hooks/useAutoFillPreview';
import { isWeekArchived } from '../hooks/usePlanner';
import { useToday } from '../hooks/useToday';
import { resolveWeekParam, SLOT_LABELS, weekDays, weekTitle, type DayInfo } from '../model/week';

export const REASON_LABELS: Readonly<Record<FillReason, string>> = {
  goal: 'Fits your goals',
  pantry: 'Uses your pantry',
  quick: 'Quick',
  gentle: 'Gentle',
};

/**
 * The toast after copying planner output into the plan, from how many meals were offered, how
 * many landed, and whether an archived week (which takes no writes) was among the targets.
 */
export function addedToPlanToast({
  offered,
  placed,
  archived,
}: {
  offered: number;
  placed: number;
  archived: boolean;
}): { message: string; tone: 'success' | 'neutral' } {
  if (placed === 0) {
    return {
      message: archived
        ? 'That week is archived, so nothing was added. Restore it from the archive to plan it.'
        : 'Those meals are already planned',
      tone: 'neutral',
    };
  }
  const added = placed === 1 ? 'Added 1 meal to your plan' : `Added ${placed} meals to your plan`;
  if (placed >= offered) return { message: added, tone: 'success' };
  return {
    message: archived
      ? `${added}. An archived week was left as it is.`
      : `${added}. The rest had been planned in the meantime.`,
    tone: 'success',
  };
}

export interface PlanWeekScreenProps {
  /** Monday of the week to fill, as it arrived in the route; anything else means this week. */
  week: string | undefined;
}

/** "Plan my week": preview an auto-filled week, then add it to the planner in one step. */
export function PlanWeekScreen({ week }: PlanWeekScreenProps) {
  const today = useToday();
  const weekStart = resolveWeekParam(week, today);
  const prefersSmall = usePreferencesStore((s) => s.prefs.smallAppetite);
  const [smallAppetite, setSmallAppetite] = useState(prefersSmall);
  const options = useMemo(
    () => ({ weekStart, today, smallAppetite }),
    [weekStart, today, smallAppetite],
  );
  const { state, accept } = useAutoFillPreview(options);
  const days = useMemo(() => weekDays(weekStart, today), [weekStart, today]);

  const ready = state.status === 'ready' ? state : null;
  const count = ready?.result.assignments.length ?? 0;
  const onAccept = () => {
    const placed = accept();
    toast.show(addedToPlanToast({ offered: count, placed, archived: isWeekArchived(weekStart) }));
    router.back();
  };

  return (
    <Screen
      testID="plan-week-screen"
      footer={
        ready && count > 0 ? (
          <Button
            label={count === 1 ? 'Add 1 meal' : `Add ${count} meals`}
            onPress={onAccept}
            haptic="medium"
            fullWidth
            testID="accept-fill"
          />
        ) : undefined
      }
    >
      <View style={styles.intro}>
        <Text variant="title2">{weekTitle(weekStart, today)}</Text>
        <Text variant="callout" tone="muted">
          Suggestions for the empty meals left this week, chosen for your goals, time and pantry.
          Meals you already planned stay as they are.
        </Text>
      </View>
      <Toggle
        label="Plan small meals"
        description="Favors gentle recipes and adds a snack each day"
        value={smallAppetite}
        onValueChange={setSmallAppetite}
        testID="small-meals"
      />
      {state.status === 'ready' ? (
        count === 0 ? (
          <EmptyState
            icon="checkmark.circle"
            title={state.result.unfilled.length > 0 ? 'No suggestions fit' : 'Nothing left to fill'}
            message={
              state.result.unfilled.length > 0
                ? 'No safe recipe fits the remaining meals within your time budget.'
                : 'Every remaining meal this week is already planned.'
            }
          />
        ) : (
          <Preview
            assignments={state.result.assignments}
            unfilled={state.result.unfilled.length}
            recipes={state.recipes}
            days={days}
          />
        )
      ) : (
        <PlanStatus state={state} loadingLabel="Planning your week" />
      )}
    </Screen>
  );
}

function Preview({
  assignments,
  unfilled,
  recipes,
  days,
}: {
  assignments: readonly AutoFillAssignment[];
  unfilled: number;
  recipes: ReadonlyMap<string, DomainRecipeSummary>;
  days: readonly DayInfo[];
}) {
  const byDay = days
    .map((d) => ({ day: d, items: assignments.filter((a) => a.day === d.day) }))
    .filter((g) => g.items.length > 0);
  return (
    <View style={styles.preview} testID="fill-preview">
      {byDay.map(({ day, items }) => (
        <View key={day.day} style={styles.day}>
          <Text variant="headline">{day.long}</Text>
          {items.map((a) => {
            const recipe = recipes.get(a.meal.recipeId);
            return (
              <Card key={a.slot} variant="outlined" padding="md" style={styles.row}>
                <Text variant="overline" tone="muted">
                  {SLOT_LABELS[a.slot]}
                </Text>
                <Text variant="subhead">{recipe?.title ?? a.meal.recipeId}</Text>
                {a.reasons.length > 0 ? (
                  <View style={styles.reasons}>
                    {a.reasons.map((r) => (
                      <Chip key={r} label={REASON_LABELS[r]} tone="primary" />
                    ))}
                  </View>
                ) : null}
              </Card>
            );
          })}
        </View>
      ))}
      {unfilled > 0 ? (
        <Text variant="footnote" tone="muted">
          {unfilled === 1
            ? '1 meal stays empty: nothing safe fit it.'
            : `${unfilled} meals stay empty: nothing safe fit them.`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space.sm },
  preview: { gap: space.xl },
  day: { gap: space.sm },
  row: { gap: space.xs },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, paddingTop: space.xs },
});
