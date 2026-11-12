import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatMinutes } from '@/domain';
import type { RecipeStep } from '@/lib/catalog';
import { Icon, Text, space, useTheme } from '@/ui';

export interface StepRowProps {
  step: RecipeStep;
  number: number;
}

/** A numbered method step, with its timer when the step names one. */
export const StepRow = memo(function StepRow({ step, number }: StepRowProps) {
  const theme = useTheme();
  const minutes = step.timerSeconds ? Math.max(1, Math.round(step.timerSeconds / 60)) : null;
  return (
    <View style={styles.row} accessible accessibilityLabel={`Step ${number}. ${step.text}`}>
      <View
        style={[
          styles.badge,
          { backgroundColor: theme.colors.primarySoft, borderRadius: theme.radii.pill },
        ]}
      >
        <Text variant="subhead" color="onPrimarySoft">
          {number}
        </Text>
      </View>
      <View style={styles.text}>
        <Text variant="body">{step.text}</Text>
        {minutes !== null ? (
          <View style={styles.timer}>
            <Icon name="timer" android="timer" size={14} color="textMuted" />
            <Text variant="caption" tone="muted">
              {formatMinutes(minutes)}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, paddingVertical: space.sm },
  badge: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: space.xs },
  timer: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
