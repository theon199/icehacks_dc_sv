import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { FitReason } from '@/domain';
import { Icon, PressableScale, Text, fontFamily, space, useTheme } from '@/ui';

import { RecipePane } from './RecipePane';
import { fitLabel } from '../model/fit';

export interface RecipeWhyPaneProps {
  /** Null while the fit is still being worked out (or cannot be, without preferences). */
  fitScore: number | null;
  reasons: readonly FitReason[];
  onOpenBreakdown: () => void;
}

/**
 * The "Why it fits" tab: how well the dish matches, the reasons as a checked list, and the way into
 * the full score breakdown.
 */
export const RecipeWhyPane = memo(function RecipeWhyPane({
  fitScore,
  reasons,
  onOpenBreakdown,
}: RecipeWhyPaneProps) {
  const theme = useTheme();
  if (fitScore === null) {
    return (
      <RecipePane testID="recipe-pane-why">
        <Text variant="subhead" tone="muted">
          We’re still working out how this fits you.
        </Text>
      </RecipePane>
    );
  }
  const label = fitLabel(fitScore);
  return (
    <RecipePane testID="recipe-pane-why">
      <View style={styles.head}>
        <View
          style={[
            styles.match,
            { backgroundColor: theme.colors.highlight, borderRadius: theme.radii.pill },
          ]}
        >
          <Text variant="caption" color="onHighlight" style={styles.bold}>
            {`${fitScore}% match`}
          </Text>
        </View>
        <Text variant="headline">{label}</Text>
      </View>
      {reasons.length > 0 ? (
        <View style={styles.bullets}>
          {reasons.map((reason) => (
            <View key={reason.code} style={styles.bullet}>
              <Icon name="checkmark" android="check" size={16} color="text" />
              <Text variant="subhead" style={styles.flex}>
                {reason.text}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="See score breakdown"
        accessibilityHint={`${label}, ${fitScore} out of 100. Shows every factor and its points.`}
        onPress={onOpenBreakdown}
        style={[styles.nav, { borderTopColor: theme.colors.border }]}
        testID="recipe-fit"
      >
        <Text variant="label" accessible={false}>
          See score breakdown
        </Text>
        <Icon name="chevron.right" android="chevron_right" size={16} />
      </PressableScale>
    </RecipePane>
  );
});

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  match: { paddingVertical: 5, paddingHorizontal: space.md - 2 },
  bold: { fontFamily: fontFamily.textBold },
  bullets: { gap: space.sm },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  flex: { flex: 1 },
  nav: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
