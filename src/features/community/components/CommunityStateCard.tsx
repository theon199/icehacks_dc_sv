import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, GlassSurface, Text, space, useTheme } from '@/ui';

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
  actions?: readonly CommunityStateAction[];
  testID?: string;
}

/**
 * The Community tab's one way of saying "nothing here yet", "loading" or "that failed": a frosted
 * card at the top of the feed with an optional spinner, a short title, a sentence and outlined
 * pill buttons, so the most-cooked rail below it stays in place.
 */
export function CommunityStateCard({
  title,
  message,
  alert = false,
  loading = false,
  actions = [],
  testID,
}: CommunityStateCardProps) {
  const theme = useTheme();
  return (
    <GlassSurface
      radius="card"
      style={[styles.card, { ...theme.elevation.medium, shadowColor: theme.colors.shadow }]}
      {...(testID === undefined ? {} : { testID })}
    >
      <View style={styles.body}>
        <View style={styles.copy}>
          {loading ? (
            <ActivityIndicator
              accessibilityLabel="Loading the community feed"
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
      </View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'visible' },
  body: { gap: space.xl, padding: space.section },
  copy: { gap: space.sm },
  spinner: { alignSelf: 'flex-start' },
});
