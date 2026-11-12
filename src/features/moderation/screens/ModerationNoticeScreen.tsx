import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  errorMessageFor,
  Screen,
  Skeleton,
  SkeletonGroup,
  Text,
  TextField,
  toast,
  useTheme,
} from '@/ui';
import { space } from '@/ui/tokens';

import { APPEAL_MAX, appealStatusText, noticeCopy } from '../actions';
import type { Decision } from '../model';
import { useAppeal, useMyDecisions } from '../queries';

export interface ModerationNoticeScreenProps {
  /** The moderation decision (action id) the notice is about. */
  noticeId: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function AppealForm({ decision }: { decision: Decision }) {
  const [message, setMessage] = useState('');
  const appeal = useAppeal();
  const trimmed = message.trim();
  return (
    <Card variant="outlined">
      <View style={styles.section}>
        <Text variant="title3">Ask for another look</Text>
        <Text variant="callout" tone="muted">
          If you think this was a mistake, tell us why. A moderator looks at the decision again and
          replies here. You can appeal each decision once within 30 days.
        </Text>
        <TextField
          label="Your appeal"
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={APPEAL_MAX}
          hint={`${trimmed.length}/${APPEAL_MAX}`}
          testID="appeal-message"
        />
        <Button
          label="Send appeal"
          onPress={() =>
            appeal.mutate(
              { actionId: decision.action_id, message: trimmed },
              {
                onSuccess: () => toast.success('Appeal sent. We will let you know the outcome.'),
                onError: (error) => toast.error(errorMessageFor(error)),
              },
            )
          }
          disabled={trimmed.length === 0}
          loading={appeal.isPending}
          fullWidth
          testID="appeal-submit"
        />
      </View>
    </Card>
  );
}

function targetLinkFor(decision: Decision) {
  if (decision.target_kind === 'post') {
    return { pathname: '/post/[id]', params: { id: decision.target_id } } as const;
  }
  return null;
}

/** What was decided about the member's content or account, and how to appeal it. */
export function ModerationNoticeScreen({ noticeId }: ModerationNoticeScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const decisions = useMyDecisions();

  if (decisions.isPending) {
    return (
      <Screen>
        <SkeletonGroup label="Loading notice">
          <Skeleton height={28} width="70%" />
          <Skeleton height={80} />
          <Skeleton height={120} />
        </SkeletonGroup>
      </Screen>
    );
  }
  if (decisions.isError) {
    return (
      <Screen scroll={false}>
        <ErrorState error={decisions.error} onRetry={() => void decisions.refetch()} />
      </Screen>
    );
  }

  const decision = decisions.data.find((d) => d.action_id === noticeId);
  if (!decision) {
    return (
      <Screen scroll={false}>
        <EmptyState
          icon="checkmark.shield"
          title="Notice not found"
          message="This notice is no longer available. Decisions older than your most recent hundred are not shown."
          actionLabel="Back"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const copy = noticeCopy(decision);
  const status = appealStatusText(decision);
  const link = targetLinkFor(decision);

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={decisions.isRefetching}
          onRefresh={() => void decisions.refetch()}
          tintColor={theme.colors.primary}
        />
      }
    >
      <View style={styles.section}>
        <Text variant="title2">{copy.title}</Text>
        <Text variant="callout" tone="muted">
          {copy.body}
        </Text>
      </View>

      <Card variant="sunken">
        <View style={styles.section}>
          <Text variant="overline" tone="muted">
            Reason
          </Text>
          <Text variant="body">{decision.reason}</Text>
          <Text variant="footnote" tone="subtle">
            {formatDate(decision.created_at)}
            {decision.suspended_until ? ` · until ${formatDate(decision.suspended_until)}` : ''}
          </Text>
        </View>
      </Card>

      {link ? (
        <Button
          label="View the post"
          variant="secondary"
          icon="doc.text"
          onPress={() => router.push(link)}
        />
      ) : null}

      {status ? (
        <Card variant="outlined">
          <View style={styles.section}>
            <Text variant="headline">Appeal</Text>
            <Text variant="callout">{status}</Text>
            {decision.appeal_note ? (
              <Text variant="callout" tone="muted">
                {`Moderator's note: ${decision.appeal_note}`}
              </Text>
            ) : null}
          </View>
        </Card>
      ) : decision.appealable ? (
        <AppealForm decision={decision} />
      ) : null}

      <Button
        label="Read the community guidelines"
        variant="ghost"
        onPress={() => router.push('/about/terms')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
});
