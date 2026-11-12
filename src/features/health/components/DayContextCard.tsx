import { StyleSheet, View } from 'react-native';

import type { DayContext } from '@/domain/health';
import { Card, Icon, Text, space } from '@/ui';

import { healthCopy } from '../copy';

const copy = healthCopy.day;

export interface DayContextCardProps {
  context: DayContext | null;
}

/** What today's workouts and sleep mean for suggestions. */
export function DayContextCard({ context }: DayContextCardProps) {
  const empty = !context || (context.workoutMinutes === 0 && context.sleepMinutes === null);

  return (
    <Card testID="health-day-context">
      <View style={styles.content}>
        <Text variant="headline">{copy.title}</Text>
        {empty ? (
          <Text variant="subhead" tone="muted">
            {context ? copy.empty : copy.pending}
          </Text>
        ) : (
          <>
            <View style={styles.stats}>
              <Stat icon="figure.walk" label={copy.activity[context.activity]}>
                {copy.workoutMinutes(context.workoutMinutes)}
              </Stat>
              <Stat
                icon="bed.double"
                label={context.shortSleep ? copy.shortNight : copy.sleepLabel}
              >
                {context.sleepMinutes === null ? copy.noSleep : copy.sleep(context.sleepMinutes)}
              </Stat>
            </View>
            {context.suggestions.length === 0 ? (
              <Text variant="subhead" tone="muted">
                {copy.noSuggestions}
              </Text>
            ) : (
              <View style={styles.list}>
                {context.suggestions.map((suggestion) => (
                  <View key={suggestion} style={styles.suggestion}>
                    <Icon name="sparkles" size={16} color="primary" />
                    <Text variant="subhead" style={styles.flex}>
                      {copy.suggestions[suggestion]}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </View>
    </Card>
  );
}

function Stat({
  icon,
  label,
  children,
}: {
  icon: 'figure.walk' | 'bed.double';
  label: string;
  children: string;
}) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}, ${children}`}>
      <Icon name={icon} size={20} color="textMuted" />
      <Text variant="bodyStrong">{label}</Text>
      <Text variant="footnote" tone="muted">
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md },
  stats: { flexDirection: 'row', gap: space.md },
  stat: { flex: 1, gap: space.xs },
  list: { gap: space.sm },
  suggestion: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  flex: { flex: 1 },
});
