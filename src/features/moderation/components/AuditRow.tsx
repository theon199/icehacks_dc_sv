import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatRelativeTime } from '@/lib/format';
import { Icon, PressableScale, Text, useTheme } from '@/ui';
import { space } from '@/ui/tokens';

import { actionPastTense } from '../actions';
import type { AuditEntry } from '../model';
import { targetNoun } from '../reasons';

export interface AuditRowProps {
  entry: AuditEntry;
  now: number;
  /** Leave out the target when the list is already about one target. */
  showTarget?: boolean;
  /** Opens the review of the entry's target; the row is a button when set. */
  onOpen?: (entry: AuditEntry) => void;
}

function AuditRowView({ entry, now, showTarget = true, onOpen }: AuditRowProps) {
  const theme = useTheme();
  const who = entry.automated
    ? 'Automatic'
    : entry.moderator
      ? `@${entry.moderator.handle}`
      : 'Former moderator';
  const what = showTarget
    ? `${actionPastTense(entry.action)} ${targetNoun(entry.target_kind)}${entry.owner ? ` by @${entry.owner.handle}` : ''}`
    : actionPastTense(entry.action);
  const label = `${what}. ${who}. ${entry.reason}. ${formatRelativeTime(entry.created_at, now)}`;
  const content = (
    <>
      <View style={styles.top}>
        <Text variant="subhead" style={styles.flex}>
          {what}
        </Text>
        <Text variant="footnote" tone="subtle">
          {formatRelativeTime(entry.created_at, now)}
        </Text>
        {onOpen ? <Icon name="chevron.right" size={14} color="textSubtle" /> : null}
      </View>
      <Text variant="callout">{entry.reason}</Text>
      <Text variant="footnote" tone="muted">
        {who}
        {entry.suspended_until
          ? ` · until ${new Date(entry.suspended_until).toLocaleDateString()}`
          : ''}
      </Text>
    </>
  );
  const rowStyle = [styles.row, { borderColor: theme.colors.border }];
  if (onOpen) {
    return (
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Opens the review"
        onPress={() => onOpen(entry)}
        pressedScale={0.99}
        style={rowStyle}
        testID={`audit-${entry.id}`}
      >
        {content}
      </PressableScale>
    );
  }
  return (
    <View accessible accessibilityLabel={label} style={rowStyle}>
      {content}
    </View>
  );
}

export const AuditRow = memo(AuditRowView);

const styles = StyleSheet.create({
  row: { gap: space.xxs, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  top: { flexDirection: 'row', gap: space.sm, alignItems: 'baseline' },
  flex: { flex: 1 },
});
