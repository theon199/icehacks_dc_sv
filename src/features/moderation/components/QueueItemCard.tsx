import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatRelativeTime } from '@/lib/format';
import type { ReportReason } from '@/lib/supabase/database.types';
import { Chip, PressableScale, Text } from '@/ui';
import { space } from '@/ui/tokens';

import type { QueueItem } from '../model';
import { reasonLabel, targetNoun } from '../reasons';
import { TargetPreview } from './TargetPreview';

export interface QueueItemCardProps {
  item: QueueItem;
  now: number;
  onOpen: (item: QueueItem) => void;
}

/** Reasons in order of how often they were given. */
export function topReasons(item: QueueItem, max = 3): ReportReason[] {
  const counts = new Map<ReportReason, number>();
  for (const report of item.reports) {
    counts.set(report.reason, (counts.get(report.reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([reason]) => reason);
}

function QueueItemCardView({ item, now, onOpen }: QueueItemCardProps) {
  const reasons = topReasons(item);
  const summary = `${item.report_count} report${item.report_count === 1 ? '' : 's'} on a ${targetNoun(item.target_kind)}`;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${summary}, first ${formatRelativeTime(item.first_reported_at, now)}`}
      accessibilityHint="Opens the review"
      onPress={() => onOpen(item)}
      pressedScale={0.99}
      style={styles.card}
      testID={`queue-${item.target_kind}-${item.target_id}`}
    >
      <View style={styles.meta}>
        <Text variant="subhead">{summary}</Text>
        <Text variant="footnote" tone="subtle">
          {formatRelativeTime(item.first_reported_at, now)}
        </Text>
      </View>
      <View style={styles.chips}>
        {item.automated_count > 0 ? <Chip label="Automatic hold" tone="accent" /> : null}
        {reasons.map((reason) => (
          <Chip key={reason} label={reasonLabel(reason)} />
        ))}
      </View>
      <TargetPreview item={item} compact />
    </PressableScale>
  );
}

export const QueueItemCard = memo(QueueItemCardView);

const styles = StyleSheet.create({
  card: { gap: space.sm, paddingVertical: space.md },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
