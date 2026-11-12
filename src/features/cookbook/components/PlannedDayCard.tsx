import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import type { DailyTargets } from '@/domain/nutrition';
import type { PlannedDay } from '@/domain/plan';
import type { RecipeSummary } from '@/lib/catalog';
import { Card, ListRow, space, Text } from '@/ui';

import { NutrientBar } from './NutrientBar';
import { nutrientRows, planDayTitle } from '../model/dayPlan';
import { SLOT_LABELS } from '../model/week';

export interface PlannedDayCardProps {
  day: PlannedDay;
  /** "Thursday, November 12" for the day's date. */
  dateLabel: string;
  weekday: string;
  targets: DailyTargets;
  recipes: ReadonlyMap<string, RecipeSummary>;
}

function portionText(portion: number): string | undefined {
  if (portion === 1) return undefined;
  if (portion === 0.5) return 'Half portion';
  return `${portion}× portion`;
}

/** One day of the two-day plan: its meals, then each nutrient against the day's target. */
export function PlannedDayCard({ day, dateLabel, weekday, targets, recipes }: PlannedDayCardProps) {
  const rows = nutrientRows(day, targets);
  return (
    <Card padding="lg" style={styles.card} testID={`planned-day-${day.index}`}>
      <View style={styles.heading}>
        <Text variant="title3">{planDayTitle(day.index, weekday)}</Text>
        <Text variant="footnote" tone="muted">
          {dateLabel}
        </Text>
      </View>
      <View>
        {day.meals.map((meal, i) => {
          const recipe = meal.recipeId ? recipes.get(meal.recipeId) : undefined;
          const portion = portionText(meal.portion);
          const id = meal.recipeId;
          return (
            <ListRow
              key={`${meal.slot}-${i}`}
              title={id ? (recipe?.title ?? 'Recipe') : 'Nothing suitable found'}
              subtitle={[SLOT_LABELS[meal.slot], portion].filter(Boolean).join(' · ')}
              divider={i < day.meals.length - 1}
              {...(id
                ? { onPress: () => router.push({ pathname: '/recipe/[id]', params: { id } }) }
                : {})}
            />
          );
        })}
      </View>
      <View style={styles.bars}>
        {rows.map((row) => (
          <NutrientBar key={row.nutrient} row={row} />
        ))}
      </View>
      {day.incomplete.length > 0 ? (
        <Text variant="caption" tone="subtle">
          Some recipes are missing a few nutrient values, so totals may read low.
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  heading: { gap: space.xxs },
  bars: { gap: space.md },
});
