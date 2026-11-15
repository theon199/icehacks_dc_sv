import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatRelativeTime } from '@/lib/format';
import type { ReportReason } from '@/lib/supabase/database.types';
import { Chip, PressableScale, Text, fontFamily } from '@/ui';
import { GlassCard } from '@/ui/GlassCard';
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
      testID={`queue-${item.target_kind}-${item.target_id}`}
    >
      {/* Pressing scales the card, never fades it: faded glass draws an empty rim. */}
      <GlassCard>
        <View style={styles.stack}>
          <View style={styles.meta}>
            <Text variant="body" style={styles.summary}>
              {summary}
            </Text>
            <Text variant="caption" tone="muted">
              {formatRelativeTime(item.first_reported_at, now)}
            </Text>
          </View>
          <View style={styles.chips}>
            {item.automated_count > 0 ? <Chip label="Automatic hold" tone="accent" /> : null}
            {reasons.map((reason) => (
              <Chip key={reason} label={reasonLabel(reason)} />
            ))}
          </View>
        </View>
        <TargetPreview item={item} compact inset />
      </GlassCard>
    </PressableScale>
  );
}

export const QueueItemCard = memo(QueueItemCardView);

const styles = StyleSheet.create({
  stack: { gap: space.sm },
  summary: { flex: 1, fontFamily: fontFamily.textSemiBold },
  meta: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
});
