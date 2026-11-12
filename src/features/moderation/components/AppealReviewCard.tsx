import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { formatRelativeTime } from '@/lib/format';
import { Button, Card, errorMessageFor, Text, TextField, toast } from '@/ui';
import { space } from '@/ui/tokens';

import { actionPastTense } from '../actions';
import { reviewHref } from '../links';
import type { AppealQueueItem } from '../model';
import { useDecideAppeal } from '../queries';
import { targetNoun } from '../reasons';

export interface AppealReviewCardProps {
  appeal: AppealQueueItem;
  now: number;
}

const NOTE_MAX = 500;

/**
 * One pending appeal with the contested decision and the two possible outcomes. Lists recycle
 * their cells, so the note and the decision request are keyed to the appeal: a note typed for
 * one member can never travel with another member's decision.
 */
export function AppealReviewCard(props: AppealReviewCardProps) {
  return <AppealReviewBody key={props.appeal.appeal_id} {...props} />;
}

function AppealReviewBody({ appeal, now }: AppealReviewCardProps) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const decide = useDecideAppeal();
  const target = { kind: appeal.action.target_kind, id: appeal.action.target_id };
  const who = appeal.appellant_handle ? `@${appeal.appellant_handle}` : 'A member';

  const submit = (outcome: 'upheld' | 'reversed') => {
    decide.mutate(
      { appealId: appeal.appeal_id, outcome, note },
      {
        onSuccess: () =>
          toast.success(outcome === 'reversed' ? 'Decision reversed.' : 'Decision upheld.'),
        onError: (error) => toast.error(errorMessageFor(error)),
      },
    );
  };

  return (
    <Card variant="outlined" padding="md" testID={`appeal-${appeal.appeal_id}`}>
      <View style={styles.body}>
        <Text variant="subhead">
          {who} appeals: {actionPastTense(appeal.action.action).toLowerCase()}{' '}
          {targetNoun(appeal.action.target_kind)}
        </Text>
        <Text variant="footnote" tone="subtle">
          Decided {formatRelativeTime(appeal.action.created_at, now)}
          {appeal.action.automated ? ' automatically' : ''} · appealed{' '}
          {formatRelativeTime(appeal.created_at, now)}
        </Text>
        <Text variant="footnote" tone="muted">
          Original reason: {appeal.action.reason}
        </Text>
        <Text variant="callout">“{appeal.message}”</Text>
        <Button
          label={`View ${targetNoun(target.kind)}`}
          variant="ghost"
          size="sm"
          icon="arrow.up.right.square"
          onPress={() => router.push(reviewHref(target))}
          testID={`appeal-${appeal.appeal_id}-view`}
        />
        <TextField
          label="Note to the member (optional)"
          value={note}
          onChangeText={setNote}
          maxLength={NOTE_MAX}
          multiline
        />
        <View style={styles.actions}>
          <Button
            label="Keep decision"
            variant="secondary"
            size="sm"
            onPress={() => submit('upheld')}
            disabled={decide.isPending}
          />
          <Button
            label="Reverse"
            size="sm"
            onPress={() => submit('reversed')}
            loading={decide.isPending}
          />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.sm },
  actions: { flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end' },
});
