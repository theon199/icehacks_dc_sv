import { Stack, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatRelativeTime } from '@/lib/format';
import { Card, EmptyState, Screen, Text, toast } from '@/ui';
import { space } from '@/ui/tokens';

import { availableActions } from '../actions';
import { AuditRow } from '../components/AuditRow';
import { ModerateForm } from '../components/ModerateForm';
import { ModeratorGate } from '../components/ModeratorGate';
import { TargetPreview } from '../components/TargetPreview';
import { parseTargetRef, type TargetRef } from '../model';
import { useAuditLog, useModerate, useQueue } from '../queries';
import { reasonLabel, targetNoun } from '../reasons';

export interface ModerationReviewScreenProps {
  kind?: string | undefined;
  targetId?: string | undefined;
}

function Review({ target }: { target: TargetRef }) {
  const router = useRouter();
  const queue = useQueue('open', true);
  const audit = useAuditLog(target, true);
  const moderate = useModerate();

  const item = useMemo(
    () =>
      queue.data?.pages
        .flatMap((page) => page.items)
        .find((entry) => entry.target_kind === target.kind && entry.target_id === target.id) ??
      null,
    [queue.data, target],
  );
  const history = audit.data?.pages.flatMap((page) => page.items) ?? [];
  const now = Math.max(queue.dataUpdatedAt, audit.dataUpdatedAt);

  const options = availableActions({
    kind: target.kind,
    // Without the queue entry the owner is unknown; the server still refuses impossible actions.
    hasOwner: item ? item.target_owner_id != null : target.kind !== 'recipe',
    snapshot: item?.target ?? null,
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: `Review ${targetNoun(target.kind)}` }} />
      {item ? (
        <TargetPreview item={item} />
      ) : (
        <Card variant="sunken">
          <Text variant="callout" tone="muted">
            {queue.isPending
              ? 'Loading…'
              : 'No open reports for this target. You can still act on it; the decision is logged.'}
          </Text>
        </Card>
      )}

      {item ? (
        <View style={styles.section}>
          <Text variant="title3">
            {item.report_count} report{item.report_count === 1 ? '' : 's'}
          </Text>
          {item.reports.map((report) => (
            <Card key={report.report_id} variant="outlined" padding="md">
              <View style={styles.report}>
                <Text variant="subhead">
                  {report.automated ? 'Automatic check' : reasonLabel(report.reason)}
                </Text>
                {report.details ? <Text variant="callout">{report.details}</Text> : null}
                <Text variant="footnote" tone="subtle">
                  {formatRelativeTime(report.created_at, now)}
                </Text>
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      <ModerateForm
        options={options}
        busy={moderate.isPending}
        error={moderate.error}
        onSubmit={({ action, reason, suspendDays }) =>
          moderate.mutate(
            { target, action, reason, ...(suspendDays ? { suspendDays } : {}) },
            {
              onSuccess: () => {
                toast.success('Decision recorded.');
                router.back();
              },
            },
          )
        }
      />

      <View style={styles.section}>
        <Text variant="title3">History</Text>
        {history.length === 0 ? (
          <Text variant="callout" tone="muted">
            {audit.isPending ? 'Loading…' : 'No earlier decisions on this target.'}
          </Text>
        ) : (
          history.map((entry) => (
            <AuditRow key={entry.id} entry={entry} now={now} showTarget={false} />
          ))
        )}
      </View>
    </Screen>
  );
}

/** One reported target: what it is, why it was reported, what was done before, and the decision. */
export function ModerationReviewScreen({ kind, targetId }: ModerationReviewScreenProps) {
  const target = useMemo(() => parseTargetRef(kind, targetId), [kind, targetId]);
  return (
    <ModeratorGate>
      {target ? (
        <Review target={target} />
      ) : (
        <Screen scroll={false}>
          <EmptyState
            tone="danger"
            icon="exclamationmark.triangle"
            title="Nothing to review"
            message="This link does not point at a post, comment, member or recipe."
          />
        </Screen>
      )}
    </ModeratorGate>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  report: { gap: space.xs },
});
