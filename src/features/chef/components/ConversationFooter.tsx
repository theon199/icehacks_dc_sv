import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Icon, Text, gutter, space } from '@/ui';

import { AnswerCard } from './AnswerCard';
import { ChefBadge } from './ChefBadge';
import { SuggestionChip } from './SuggestionChip';
import { ThinkingDots } from './ThinkingDots';
import type { AiProblem } from '../logic/problems';

export interface ConversationFooterProps {
  sending: boolean;
  problem: AiProblem | null;
  /** The person's last message has no answer and nothing is in flight. */
  unanswered: boolean;
  /** Another thread is waiting for its answer, so asking here has to wait. */
  blocked: boolean;
  /** Today's allowance is spent, so asking again cannot work until it resets. */
  limited: boolean;
  followUps: readonly string[];
  quotaNote: string | null;
  onRetry: () => void;
  onDismissProblem: () => void;
  onFollowUp: (question: string) => void;
}

/**
 * Everything under the newest message: Chef's thinking card, a problem card with a way forward, and
 * follow-up questions in one sideways row so they never push the answer up.
 */
export function ConversationFooter({
  sending,
  problem,
  unanswered,
  blocked,
  limited,
  followUps,
  quotaNote,
  onRetry,
  onDismissProblem,
  onFollowUp,
}: ConversationFooterProps) {
  const showFollowUps = !problem && !blocked && !limited && followUps.length > 0;
  return (
    <View style={styles.container}>
      {sending ? (
        <AnswerCard>
          <ChefBadge />
          <View
            style={styles.thinking}
            accessible
            accessibilityLabel="Chef is thinking"
            accessibilityLiveRegion="polite"
          >
            <ThinkingDots />
            <Text variant="callout" tone="muted" accessible={false}>
              Thinking…
            </Text>
          </View>
        </AnswerCard>
      ) : null}

      {problem ? (
        <AnswerCard testID="chef-problem">
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
          <Text variant="subhead" tone="muted">
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
        </AnswerCard>
      ) : null}

      {!sending && !problem && unanswered && !blocked && !limited ? (
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

      {showFollowUps ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          accessibilityLabel="Suggested questions"
          style={styles.bleed}
          contentContainerStyle={styles.chips}
        >
          {followUps.map((question) => (
            <SuggestionChip
              key={question}
              label={question}
              icon="arrow.turn.down.right"
              onPress={() => onFollowUp(question)}
            />
          ))}
        </ScrollView>
      ) : null}

      {quotaNote ? (
        <Text variant="footnote" tone="muted" align="center">
          {quotaNote}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.md, paddingTop: space.md },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2, minHeight: 22 },
  problemHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2 },
  actions: { flexDirection: 'row', gap: space.xs + 2, alignItems: 'center', marginTop: space.xs },
  start: { alignSelf: 'flex-start' },
  // The row runs to the screen edges while scrolling sideways.
  bleed: { marginHorizontal: -gutter },
  chips: { gap: space.sm, paddingHorizontal: gutter },
  flex: { flex: 1 },
});
