import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, Card, Chip, Icon, Text, space, useTheme } from '@/ui';

import type { AiProblem } from '../logic/problems';

export interface ConversationFooterProps {
  sending: boolean;
  problem: AiProblem | null;
  /** The person's last message has no answer and nothing is in flight. */
  unanswered: boolean;
  /** Another thread is waiting for its answer, so asking here has to wait. */
  blocked: boolean;
  followUps: readonly string[];
  quotaNote: string | null;
  onRetry: () => void;
  onDismissProblem: () => void;
  onFollowUp: (question: string) => void;
}

/** Everything under the newest message: progress, problems with a way forward, suggestions. */
export function ConversationFooter({
  sending,
  problem,
  unanswered,
  blocked,
  followUps,
  quotaNote,
  onRetry,
  onDismissProblem,
  onFollowUp,
}: ConversationFooterProps) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      {sending ? (
        <View
          style={styles.thinking}
          accessible
          accessibilityLabel="Chef is thinking"
          accessibilityLiveRegion="polite"
        >
          <ActivityIndicator color={theme.colors.primary} />
          <Text variant="callout" tone="muted" accessible={false}>
            Chef is thinking…
          </Text>
        </View>
      ) : null}

      {problem ? (
        <Card variant="sunken" testID="chef-problem" style={styles.problem}>
          <View style={styles.problemHead}>
            <Icon
              name={problem.kind === 'daily_limit' ? 'hourglass' : 'exclamationmark.triangle'}
              size={20}
              color={problem.kind === 'daily_limit' ? 'warning' : 'danger'}
            />
            <Text variant="headline" style={styles.flex} accessibilityLiveRegion="polite">
              {problem.title}
            </Text>
          </View>
          <Text variant="callout" tone="muted">
            {problem.message}
          </Text>
          <View style={styles.actions}>
            {problem.canRetry ? (
              <Button
                testID="chef-retry"
                label="Try again"
                icon="arrow.clockwise"
                size="sm"
                onPress={onRetry}
              />
            ) : null}
            <Button label="Dismiss" variant="ghost" size="sm" onPress={onDismissProblem} />
          </View>
        </Card>
      ) : null}

      {!sending && !problem && unanswered && !blocked ? (
        <Button
          testID="chef-ask-again"
          label="No answer yet. Ask again"
          icon="arrow.clockwise"
          variant="secondary"
          size="sm"
          style={styles.start}
          onPress={onRetry}
        />
      ) : null}

      {!sending && !problem && followUps.length > 0 ? (
        <View style={styles.chips} accessibilityLabel="Suggested questions">
          {followUps.map((question) => (
            <Chip
              key={question}
              label={question}
              tone="primary"
              icon="arrow.turn.down.right"
              onPress={() => onFollowUp(question)}
            />
          ))}
        </View>
      ) : null}

      {quotaNote ? (
        <Text variant="footnote" tone="subtle" align="center">
          {quotaNote}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.md, paddingTop: space.lg },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  problem: { gap: space.sm },
  problemHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  actions: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  start: { alignSelf: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  flex: { flex: 1 },
});
