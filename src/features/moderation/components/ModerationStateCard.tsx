import { StyleSheet, View } from 'react-native';

import { Button, Text, fontFamily, space } from '@/ui';
import { GlassCard } from '@/ui/GlassCard';

export interface ModerationStateCardProps {
  /** A short heading over the message, e.g. "Notice not found". */
  title?: string;
  message: string;
  /** The message reports a failure: drawn in the danger colour and announced. */
  alert?: boolean;
  /** Offers one secondary button under the message, e.g. a retry or a way back. */
  action?: { label: string; onPress: () => void };
  testID?: string;
}

/**
 * How the moderation and safety pages say "loading", "nothing here" or "that failed": one glass
 * card with an optional heading, a sentence and at most one secondary button.
 */
export function ModerationStateCard({
  title,
  message,
  alert = false,
  action,
  testID,
}: ModerationStateCardProps) {
  return (
    <GlassCard {...(testID === undefined ? {} : { testID })}>
      <View style={styles.copy}>
        {title ? (
          <Text variant="body" accessibilityRole="header" style={styles.heading}>
            {title}
          </Text>
        ) : null}
        <Text
          variant="body"
          color={alert ? 'danger' : 'textMuted'}
          {...(alert ? { accessibilityRole: 'alert' as const } : {})}
        >
          {message}
        </Text>
      </View>
      {action ? (
        <Button label={action.label} variant="secondary" fullWidth onPress={action.onPress} />
      ) : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  copy: { gap: space.sm },
  heading: { fontFamily: fontFamily.textSemiBold },
});
