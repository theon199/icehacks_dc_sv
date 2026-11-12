import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { SafetyVerdict } from '@/domain';
import { Icon, Text, space, useTheme } from '@/ui';

export interface SafetyWarningProps {
  verdict: SafetyVerdict | null;
  /** Optional line above the reasons, naming which dish the warning is about. */
  subject?: string;
}

/**
 * "Check before you cook": every reason a dish does not clear the person's allergens and diets.
 * Renders nothing when there is no verdict yet or the dish is eligible.
 */
export const SafetyWarning = memo(function SafetyWarning({ verdict, subject }: SafetyWarningProps) {
  const theme = useTheme();
  if (!verdict || verdict.eligible) return null;
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.warning,
        { backgroundColor: theme.colors.warningSoft, borderRadius: theme.radii.md },
      ]}
    >
      <Icon
        name="exclamationmark.triangle.fill"
        android="warning"
        size={18}
        color="onWarningSoft"
      />
      <View style={styles.text}>
        <Text variant="subhead" color="onWarningSoft">
          Check before you cook
        </Text>
        {subject ? (
          <Text variant="footnote" color="onWarningSoft">
            {subject}
          </Text>
        ) : null}
        {verdict.reasons.map((reason, index) => (
          <Text key={`${reason.code}-${index}`} variant="footnote" color="onWarningSoft">
            {reason.message}
          </Text>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  warning: { flexDirection: 'row', gap: space.sm, padding: space.md },
  text: { flex: 1, gap: 2 },
});
