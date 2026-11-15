import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';

import { haptics } from '@/lib/haptics';
import type { ReportReason } from '@/lib/supabase/database.types';
import {
  Button,
  EmptyState,
  errorMessageFor,
  GlassCard,
  SheetContent,
  Text,
  TextField,
  toast,
} from '@/ui';

import { ReasonPicker } from '../components/ReasonPicker';
import { parseTargetRef, type TargetRef } from '../model';
import { useBlockUser, useReport } from '../queries';
import { DETAILS_MAX, reasonsFor, reportDraftProblem, targetNoun } from '../reasons';

export interface ReportScreenProps {
  target?: string | undefined;
  targetId?: string | undefined;
  /** How the target is shown to the person, e.g. a display name; used in copy only. */
  label?: string | undefined;
}

/** After a report about a person: the offer to block them too. */
function BlockOffer({ target, label }: { target: TargetRef; label: string | undefined }) {
  const block = useBlockUser();
  const name = label?.trim() || 'this person';
  return (
    <GlassCard>
      <Text variant="callout" tone="muted">
        {`You can also block ${name}. You will stop seeing each other's posts, comments and profiles.`}
      </Text>
      <Button
        label={block.isSuccess ? 'Blocked' : `Block ${name}`}
        variant="secondary"
        icon="hand.raised"
        disabled={block.isSuccess}
        loading={block.isPending}
        onPress={() =>
          block.mutate(
            { userId: target.id, displayName: label?.trim() || 'Blocked member', handle: null },
            {
              onSuccess: () => toast.success(`You blocked ${name}.`),
              onError: (error) => toast.error(errorMessageFor(error)),
            },
          )
        }
      />
    </GlassCard>
  );
}

/**
 * Report a post, comment, person or recipe: pick a reason, add details, send. Every state renders
 * the one sheet, so moving from the form to the thanks keeps it in place instead of reopening it.
 */
export function ReportScreen({ target: rawKind, targetId, label }: ReportScreenProps) {
  const router = useRouter();
  const target = useMemo(() => parseTargetRef(rawKind, targetId), [rawKind, targetId]);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [touched, setTouched] = useState(false);
  const report = useReport();

  if (!target) {
    return (
      <SheetContent>
        <EmptyState
          tone="danger"
          icon="exclamationmark.triangle"
          title="Nothing to report"
          message="We couldn't tell what you wanted to report. Go back and try again from the post, comment or profile."
          actionLabel="Close"
          onAction={() => router.back()}
        />
      </SheetContent>
    );
  }

  if (report.isSuccess) {
    return (
      <SheetContent
        title="Thanks for telling us"
        description="A moderator will look at it. The person you reported is not told who reported them."
        footer={
          <Button label="Done" onPress={() => router.back()} fullWidth testID="report-done" />
        }
      >
        {target.kind === 'user' ? <BlockOffer target={target} label={label} /> : null}
      </SheetContent>
    );
  }

  const options = reasonsFor(target.kind);
  const problem = reportDraftProblem(target.kind, { reason, details });
  const noun = targetNoun(target.kind);

  const submit = () => {
    setTouched(true);
    if (problem || !reason) return;
    report.mutate(
      { target, reason, details },
      {
        onSuccess: () => haptics.success(),
        onError: (error) => toast.error(errorMessageFor(error)),
      },
    );
  };

  return (
    <SheetContent
      title={`Report this ${noun}`}
      description="Reports are private. Tell us what is wrong and a moderator will review it."
      maxHeightRatio={0.9}
    >
      <GlassCard>
        <Text variant="bodyStrong" accessibilityRole="header">
          Reason
        </Text>
        <ReasonPicker options={options} value={reason} onChange={setReason} />
      </GlassCard>
      <GlassCard>
        <TextField
          label={reason === 'other' ? 'Details' : 'Details (optional)'}
          hint="Anything that helps a moderator understand the problem."
          value={details}
          onChangeText={setDetails}
          multiline
          maxLength={DETAILS_MAX}
          testID="report-details"
        />
        {touched && problem ? (
          <Text variant="footnote" tone="danger" accessibilityLiveRegion="polite">
            {problem}
          </Text>
        ) : null}
        <Button
          label="Send report"
          onPress={submit}
          loading={report.isPending}
          fullWidth
          testID="report-submit"
        />
      </GlassCard>
    </SheetContent>
  );
}
