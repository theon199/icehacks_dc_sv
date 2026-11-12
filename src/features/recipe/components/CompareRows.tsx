import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Icon, Text, space, useTheme, type IconName } from '@/ui';

import type {
  CompareSide,
  CompareSummary,
  DeltaDirection,
  DiffEntry,
  DiffKind,
  NutritionDelta,
} from '../model/compare';
import { confidenceLabel } from '../model/nutrition';

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export function summaryLine(summary: CompareSummary): string {
  const parts: string[] = [];
  if (summary.swapped > 0) parts.push(plural(summary.swapped, 'swap', 'swaps'));
  if (summary.removed > 0) parts.push(`${summary.removed} left out`);
  if (summary.added > 0) parts.push(`${summary.added} added`);
  if (summary.better > 0) parts.push(`${plural(summary.better, 'nutrient', 'nutrients')} better`);
  if (summary.worse > 0) parts.push(`${summary.worse} worse`);
  return parts.length > 0 ? parts.join(' · ') : 'Very similar recipes';
}

export const CompareHeader = memo(function CompareHeader({
  original,
  adapted,
  personal,
  summary,
}: {
  original: CompareSide;
  adapted: CompareSide;
  personal: boolean;
  summary: CompareSummary;
}) {
  const theme = useTheme();
  const side = (label: string, s: CompareSide, tone: 'muted' | 'primary') => (
    <View style={styles.side}>
      <Text variant="overline" tone={tone}>
        {label}
      </Text>
      <Text variant="headline" numberOfLines={3}>
        {s.title}
      </Text>
      <Text variant="caption" tone="subtle">
        Nutrition {confidenceLabel(s.nutrition ? s.confidence : 'none').title.toLowerCase()}
      </Text>
    </View>
  );
  return (
    <View style={styles.header}>
      <View style={styles.sides}>
        {side('Original', original, 'muted')}
        <Icon name="arrow.right" android="arrow_forward" size={18} color="textSubtle" />
        {side(personal ? 'Your version' : 'Healthier take', adapted, 'primary')}
      </View>
      <View
        style={[
          styles.summary,
          { backgroundColor: theme.colors.primarySoft, borderRadius: theme.radii.md },
        ]}
      >
        <Text variant="subhead" color="onPrimarySoft">
          {summaryLine(summary)}
        </Text>
      </View>
    </View>
  );
});

const DIRECTION_COLOR: Readonly<
  Record<DeltaDirection, 'success' | 'danger' | 'textMuted' | 'textSubtle'>
> = {
  better: 'success',
  worse: 'danger',
  neutral: 'textMuted',
  same: 'textSubtle',
  unknown: 'textSubtle',
};

const DIRECTION_WORD: Readonly<Record<DeltaDirection, string>> = {
  better: 'better',
  worse: 'worse',
  neutral: 'changed',
  same: 'about the same',
  unknown: 'unknown',
};

export const DeltaTable = memo(function DeltaTable({
  deltas,
}: {
  deltas: readonly NutritionDelta[];
}) {
  const theme = useTheme();
  return (
    <Card variant="outlined" padding="md" style={styles.table}>
      <View style={styles.deltaRow}>
        <Text variant="caption" tone="subtle" style={styles.deltaLabel}>
          Per serving
        </Text>
        <Text variant="caption" tone="subtle" style={styles.deltaValue}>
          Before
        </Text>
        <Text variant="caption" tone="subtle" style={styles.deltaValue}>
          After
        </Text>
        <Text variant="caption" tone="subtle" style={styles.deltaChange}>
          Change
        </Text>
      </View>
      {deltas.map((d) => (
        <View
          key={d.key}
          accessible
          accessibilityLabel={`${d.label}: ${d.before} before, ${d.after} after, ${DIRECTION_WORD[d.direction]}`}
          style={[styles.deltaRow, { borderTopColor: theme.colors.border }, styles.rule]}
        >
          <Text variant="subhead" style={styles.deltaLabel}>
            {d.label}
          </Text>
          <Text variant="footnote" tone="muted" style={styles.deltaValue}>
            {d.before}
          </Text>
          <Text variant="footnote" style={styles.deltaValue}>
            {d.after}
          </Text>
          <Text variant="footnote" color={DIRECTION_COLOR[d.direction]} style={styles.deltaChange}>
            {d.direction === 'same' ? 'same' : (d.change ?? '—')}
          </Text>
        </View>
      ))}
    </Card>
  );
});

const KIND_LOOK: Readonly<
  Record<
    DiffKind,
    { icon: IconName; label: string; color: 'success' | 'danger' | 'accent' | 'textMuted' }
  >
> = {
  swapped: { icon: 'arrow.triangle.swap', label: 'Swapped', color: 'accent' },
  removed: { icon: 'minus.circle', label: 'Left out', color: 'danger' },
  added: { icon: 'plus.circle', label: 'Added', color: 'success' },
  less: { icon: 'arrow.down.circle', label: 'Less', color: 'textMuted' },
  more: { icon: 'arrow.up.circle', label: 'More', color: 'textMuted' },
  same: { icon: 'equal.circle', label: 'Same', color: 'textMuted' },
};

export const DiffRow = memo(function DiffRow({ entry }: { entry: DiffEntry }) {
  const theme = useTheme();
  const look = KIND_LOOK[entry.kind];
  const before = entry.before?.name;
  const after = entry.after?.name;
  const title = entry.kind === 'swapped' ? `${before} → ${after}` : (after ?? before ?? '');
  return (
    <View
      style={[styles.diff, { borderBottomColor: theme.colors.border }]}
      accessible
      accessibilityLabel={`${look.label}: ${entry.kind === 'swapped' ? `${before} to ${after}` : title}${entry.note ? `. ${entry.note}` : ''}`}
    >
      <Icon name={look.icon} size={20} color={look.color} />
      <View style={styles.diffText}>
        <Text variant="body">{title}</Text>
        <Text variant="caption" tone="muted">
          {look.label}
          {entry.kind === 'more' || entry.kind === 'less' ? ' per serving' : ''}
        </Text>
        {entry.note ? (
          <Text variant="footnote" tone="muted">
            {entry.note}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  header: { gap: space.md, paddingTop: space.lg },
  sides: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  side: { flex: 1, gap: 2 },
  summary: { padding: space.md },
  table: { gap: space.xxs },
  deltaRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.xs },
  rule: { borderTopWidth: StyleSheet.hairlineWidth },
  deltaLabel: { flex: 1.4 },
  deltaValue: { flex: 1, textAlign: 'right' },
  deltaChange: { flex: 1, textAlign: 'right' },
  diff: {
    flexDirection: 'row',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  diffText: { flex: 1, gap: 2 },
});
