import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatRelativeTime } from '@/lib/format';
import { Text, useTheme } from '@/ui';
import { space } from '@/ui/tokens';

import { actionPastTense } from '../actions';
import type { AuditEntry } from '../model';
import { targetNoun } from '../reasons';

export interface AuditRowProps {
  entry: AuditEntry;
  now: number;
  /** Leave out the target when the list is already about one target. */
  showTarget?: boolean;
}

function AuditRowView({ entry, now, showTarget = true }: AuditRowProps) {
  const theme = useTheme();
  const who = entry.automated
    ? 'Automatic'
    : entry.moderator
      ? `@${entry.moderator.handle}`
      : 'Former moderator';
  const what = showTarget
    ? `${actionPastTense(entry.action)} ${targetNoun(entry.target_kind)}${entry.owner ? ` by @${entry.owner.handle}` : ''}`
    : actionPastTense(entry.action);
  return (
    <View
      accessible
      accessibilityLabel={`${what}. ${who}. ${entry.reason}. ${formatRelativeTime(entry.created_at, now)}`}
      style={[styles.row, { borderColor: theme.colors.border }]}
    >
      <View style={styles.top}>
        <Text variant="subhead" style={styles.flex}>
          {what}
        </Text>
        <Text variant="footnote" tone="subtle">
          {formatRelativeTime(entry.created_at, now)}
        </Text>
      </View>
      <Text variant="callout">{entry.reason}</Text>
      <Text variant="footnote" tone="muted">
        {who}
        {entry.suspended_until
          ? ` · until ${new Date(entry.suspended_until).toLocaleDateString()}`
          : ''}
      </Text>
    </View>
  );
}

export const AuditRow = memo(AuditRowView);

const styles = StyleSheet.create({
  row: { gap: space.xxs, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  top: { flexDirection: 'row', gap: space.sm, alignItems: 'baseline' },
  flex: { flex: 1 },
});
