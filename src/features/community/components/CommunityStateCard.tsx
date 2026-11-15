import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, Text, space, useTheme } from '@/ui';
import { GlassCard } from '@/ui/GlassCard';

export interface CommunityStateAction {
  label: string;
  onPress: () => void;
  /** Spoken after the label, e.g. where the button goes. */
  accessibilityHint?: string;
}

export interface CommunityStateCardProps {
  title?: string;
  message: string;
  /** The message reports a failure: drawn in the danger colour and announced. */
  alert?: boolean;
  loading?: boolean;
  /** Spoken for the spinner; say what is loading. */
  loadingLabel?: string;
  actions?: readonly CommunityStateAction[];
  testID?: string;
}

/**
 * Community's one way of saying "nothing here yet", "loading" or "that failed": a glass card with
 * an optional spinner, a short title, a sentence and outlined pill buttons. On the feed it sits at
 * the top so the most-cooked rail below it stays in place.
 */
export function CommunityStateCard({
  title,
  message,
  alert = false,
  loading = false,
  loadingLabel = 'Loading the community feed',
  actions = [],
  testID,
}: CommunityStateCardProps) {
  const theme = useTheme();
  return (
    <GlassCard {...(testID === undefined ? {} : { testID })}>
      <View style={styles.copy}>
        {loading ? (
          <ActivityIndicator
            accessibilityLabel={loadingLabel}
            color={theme.colors.primary}
            style={styles.spinner}
          />
        ) : null}
        {title ? (
          <Text variant="bodyStrong" accessibilityRole="header">
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
      {actions.map((action) => (
        <Button
          key={action.label}
          label={action.label}
          variant="secondary"
          fullWidth
          onPress={action.onPress}
          {...(action.accessibilityHint === undefined
            ? {}
            : { accessibilityHint: action.accessibilityHint })}
        />
      ))}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  copy: { gap: space.sm },
  spinner: { alignSelf: 'flex-start' },
});
