import { Stack, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useSessionStore } from '@/features/auth';
import { formatRelativeTime } from '@/lib/format';
import { Card, Chip, EmptyState, ErrorState, Screen, Text, toast } from '@/ui';
import { space } from '@/ui/tokens';

import { availableActions } from '../actions';
import { AuditRow } from '../components/AuditRow';
import { ModerateForm } from '../components/ModerateForm';
import { ModeratorGate } from '../components/ModeratorGate';
import { TargetPreview } from '../components/TargetPreview';
import { parseTargetRef, type TargetRef } from '../model';
import { useAuditLog, useModerate, useReviewTarget, useTargetReports } from '../queries';
import { reasonLabel, targetNoun } from '../reasons';
import type { ReviewTarget, TargetReport } from '../reviewTarget';

export interface ModerationReviewScreenProps {
  kind?: string | undefined;
  targetId?: string | undefined;
}

function missingText(review: ReviewTarget): string {
  const noun = targetNoun(review.target.kind);
  if (review.target.kind === 'user') {
    return 'This profile is not available. The account may be deleted, or one of you blocked the other.';
  }
  return `This ${noun} no longer exists.`;
}

function ReportList({ reports, now }: { reports: readonly TargetReport[]; now: number }) {
  const open = reports.filter((report) => report.status === 'open').length;
  return (
    <View style={styles.section}>
      <Text variant="title3">
        {open > 0
          ? `${open} open report${open === 1 ? '' : 's'}`
          : reports.length > 0
            ? 'No open reports'
            : 'No reports'}
      </Text>
      {reports.map((report) => (
        <Card key={report.id} variant="outlined" padding="md">
          <View style={styles.report}>
            <View style={styles.reportTop}>
              <Text variant="subhead" style={styles.flex}>
                {report.automated ? 'Automatic check' : reasonLabel(report.reason)}
              </Text>
              {report.status === 'open' ? null : (
                <Chip label={report.status === 'actioned' ? 'Actioned' : 'Dismissed'} />
              )}
            </View>
            {report.details ? <Text variant="callout">{report.details}</Text> : null}
            <Text variant="footnote" tone="subtle">
              {formatRelativeTime(report.created_at, now)}
            </Text>
          </View>
        </Card>
      ))}
    </View>
  );
}

function Review({ target }: { target: TargetRef }) {
  const router = useRouter();
  const userId = useSessionStore((s) => s.userId);
  const review = useReviewTarget(target, true);
  const reports = useTargetReports(target, true);
  const audit = useAuditLog(target, true);
  const moderate = useModerate();

  const history = useMemo(
    () => audit.data?.pages.flatMap((page) => page.items) ?? [],
    [audit.data],
  );
  const now = Math.max(review.dataUpdatedAt, reports.dataUpdatedAt, audit.dataUpdatedAt);

  const data = review.data;
  const ownTarget = data?.ownerId != null && data.ownerId === userId;
  // A post or comment that cannot be found cannot be acted on; the server refuses every action.
  const actionable =
    data != null &&
    !ownTarget &&
    (data.exists || target.kind === 'user' || target.kind === 'recipe');
  const options = data
    ? availableActions({
        kind: target.kind,
        hasOwner: data.ownerId != null,
        snapshot: data.snapshot,
        statusKnown: data.statusKnown,
        suspensionKnown: data.suspensionKnown,
      })
    : [];

  return (
    <Screen>
      <Stack.Screen options={{ title: `Review ${targetNoun(target.kind)}` }} />
      {review.isPending ? (
        <Card variant="sunken">
          <Text variant="callout" tone="muted">
            Loading…
          </Text>
        </Card>
      ) : review.isError ? (
        <ErrorState error={review.error} onRetry={() => void review.refetch()} />
      ) : (
        <TargetPreview
          item={{
            target_kind: target.kind,
            target_id: target.id,
            target: review.data.snapshot,
            owner_handle: review.data.ownerHandle,
          }}
          photos={review.data.photos}
          missingText={missingText(review.data)}
        />
      )}

      {reports.isError ? (
        <ErrorState
          error={reports.error}
          title="Reports didn't load"
          onRetry={() => void reports.refetch()}
        />
      ) : reports.data ? (
        <ReportList reports={reports.data} now={now} />
      ) : null}

      {ownTarget ? (
        <Card variant="sunken" testID="review-own-target">
          <Text variant="callout" tone="muted">
            {target.kind === 'user'
              ? 'This is your account. Another moderator has to review it.'
              : `This is your ${targetNoun(target.kind)}. Another moderator has to review it.`}
          </Text>
        </Card>
      ) : actionable ? (
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
      ) : null}

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

/** One target: what it is now, why it was reported, what was done before, and the decision. */
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
  reportTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
});
