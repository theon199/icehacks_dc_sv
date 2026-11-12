import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { DailyTargets } from '@/domain/nutrition';
import type { NutritionConfidence, RecipeNutrition } from '@/lib/catalog';
import { formatPercent } from '@/lib/format';
import { Card, Text, space, useTheme } from '@/ui';

import {
  confidenceLabel,
  nutritionRows,
  targetBasisLabel,
  type NutritionRow,
} from '../model/nutrition';

export interface NutritionPanelProps {
  nutrition: RecipeNutrition | null;
  confidence: NutritionConfidence;
  targets: DailyTargets;
  /** Portion per serving (0.5 for half portions). */
  portion: number;
}

function shareColor(row: NutritionRow): 'danger' | 'success' | 'textMuted' {
  if (row.dailyShare === null) return 'textMuted';
  // A single serving using more than 40% of a daily limit is worth noticing.
  if (row.kind === 'max' && row.dailyShare > 0.4) return 'danger';
  if (row.kind === 'min' && row.dailyShare >= 0.2) return 'success';
  return 'textMuted';
}

/** Nutrition per serving with % of daily targets and how the numbers were produced. */
export const NutritionPanel = memo(function NutritionPanel({
  nutrition,
  confidence,
  targets,
  portion,
}: NutritionPanelProps) {
  const theme = useTheme();
  const effective: NutritionConfidence = nutrition ? confidence : 'none';
  const label = confidenceLabel(effective);
  const rows = useMemo(
    () => (nutrition ? nutritionRows(nutrition, targets, portion) : []),
    [nutrition, targets, portion],
  );

  return (
    <Card variant="outlined" padding="lg" testID="recipe-nutrition" style={styles.card}>
      <View style={styles.header}>
        <Text variant="headline">Per serving{portion !== 1 ? ' (half portion)' : ''}</Text>
        <View
          style={[
            styles.confidence,
            {
              backgroundColor:
                effective === 'computed' ? theme.colors.successSoft : theme.colors.warningSoft,
              borderRadius: theme.radii.pill,
            },
          ]}
        >
          <Text
            variant="caption"
            color={effective === 'computed' ? 'onSuccessSoft' : 'onWarningSoft'}
          >
            {label.title}
          </Text>
        </View>
      </View>
      <Text variant="footnote" tone="muted">
        {label.detail}
      </Text>
      {rows.length > 0 ? (
        <View style={styles.table}>
          {rows.map((row) => (
            <View
              key={row.key}
              accessible
              accessibilityLabel={`${row.label} ${row.value}${
                row.dailyShare !== null ? `, ${formatPercent(row.dailyShare)} of daily` : ''
              }`}
              style={[
                styles.row,
                row.sub && styles.sub,
                { borderBottomColor: theme.colors.border },
              ]}
            >
              <Text variant={row.sub ? 'footnote' : 'subhead'} style={styles.label}>
                {row.label}
              </Text>
              <Text variant={row.sub ? 'footnote' : 'subhead'}>{row.value}</Text>
              <Text variant="footnote" color={shareColor(row)} style={styles.share}>
                {row.dailyShare !== null ? formatPercent(row.dailyShare) : ''}
              </Text>
            </View>
          ))}
          <Text variant="caption" tone="subtle">
            {targetBasisLabel(targets)}. For information, not medical advice.
          </Text>
        </View>
      ) : null}
    </Card>
  );
});

const styles = StyleSheet.create({
  card: { gap: space.xs },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  confidence: { paddingHorizontal: space.sm, paddingVertical: 2 },
  table: { marginTop: space.xs, gap: space.xxs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sub: { paddingLeft: space.lg },
  label: { flex: 1 },
  share: { width: 52, textAlign: 'right' },
});
