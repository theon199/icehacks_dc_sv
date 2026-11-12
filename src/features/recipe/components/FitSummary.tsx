import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { FitReason } from '@/domain';
import { Icon, PressableScale, ProgressRing, Text, space, useTheme } from '@/ui';

import { fitLabel } from '../model/fit';

export interface FitSummaryProps {
  fitScore: number;
  reasons: readonly FitReason[];
  onPress: () => void;
}

/** Fit score ring with the top reasons; opens the "Why this fits you" sheet. */
export const FitSummary = memo(function FitSummary({
  fitScore,
  reasons,
  onPress,
}: FitSummaryProps) {
  const theme = useTheme();
  const label = fitLabel(fitScore);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${label}, fit score ${fitScore} out of 100. ${reasons
        .map((r) => r.text)
        .join('. ')}`}
      accessibilityHint="Shows why this recipe fits you"
      onPress={onPress}
      style={[
        styles.card,
        { backgroundColor: theme.colors.primarySoft, borderRadius: theme.radii.lg },
      ]}
      testID="recipe-fit"
    >
      <ProgressRing progress={fitScore / 100} size={60} accessibilityLabel="Fit score">
        <Text variant="headline" color="onPrimarySoft">
          {fitScore}
        </Text>
      </ProgressRing>
      <View style={styles.text}>
        <Text variant="headline" color="onPrimarySoft">
          {label}
        </Text>
        {reasons.slice(0, 3).map((reason) => (
          <Text key={reason.code} variant="footnote" color="onPrimarySoft" numberOfLines={2}>
            {reason.text}
          </Text>
        ))}
        <Text variant="caption" color="primary">
          Why this fits you
        </Text>
      </View>
      <Icon name="chevron.right" android="chevron_right" size={16} color="onPrimarySoft" />
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
  },
  text: { flex: 1, gap: 2 },
});
