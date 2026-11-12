import { StyleSheet, View } from 'react-native';

import { GLUCOSE_INSIGHT_RULES, type GlucoseSummary } from '@/domain/health';
import { Card, ProgressRing, Text, space } from '@/ui';

import { healthCopy } from '../copy';

const copy = healthCopy.glucose;

export interface GlucoseInsightsCardProps {
  summary: GlucoseSummary;
  titles: Record<string, string>;
}

/** Which cooked dishes were followed by steadier glucose, once there is enough data to say. */
export function GlucoseInsightsCard({ summary, titles }: GlucoseInsightsCardProps) {
  const needed = GLUCOSE_INSIGHT_RULES.minPairedDays;
  const steadier = summary.dishes.filter((dish) => dish.steadier);

  return (
    <Card testID="health-glucose">
      <View style={styles.content}>
        <Text variant="headline">{copy.title}</Text>

        {summary.status === 'no_data' ? (
          <Text variant="subhead" tone="muted">
            {copy.noData}
          </Text>
        ) : null}

        {summary.status === 'collecting' ? (
          <View style={styles.collecting}>
            <ProgressRing
              progress={summary.pairedDays / needed}
              size={48}
              accessibilityLabel="Glucose insight progress"
            />
            <View style={styles.flex}>
              <Text variant="subhead">{copy.collecting(summary.pairedDays, needed)}</Text>
              <Text variant="footnote" tone="muted">
                {copy.collectingHint}
              </Text>
            </View>
          </View>
        ) : null}

        {summary.status === 'ready' ? (
          <>
            <Text variant="subhead" tone="muted">
              {copy.ready}
            </Text>
            {steadier.length === 0 ? (
              <Text variant="subhead">{copy.noSteadier}</Text>
            ) : (
              <View style={styles.list}>
                <Text variant="label" tone="subtle">
                  {copy.steadierTitle}
                </Text>
                {steadier.map((dish) => (
                  <View
                    key={dish.recipeRef}
                    style={styles.dish}
                    accessible
                    accessibilityLabel={`${titles[dish.recipeRef] ?? copy.unknownDish}, ${copy.dishLine(dish.pairCount, dish.medianRiseMgdl)}`}
                  >
                    <Text variant="bodyStrong" numberOfLines={2}>
                      {titles[dish.recipeRef] ?? copy.unknownDish}
                    </Text>
                    <Text variant="footnote" tone="muted">
                      {copy.dishLine(dish.pairCount, dish.medianRiseMgdl)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md },
  collecting: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  list: { gap: space.sm },
  dish: { gap: 2 },
  flex: { flex: 1, gap: space.xs },
});
