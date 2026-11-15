import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space, Text, useTheme } from '@/ui';

export interface StatusCardProps {
  title: string;
  message: string;
  /** Extra lines between the message and the actions. */
  details?: ReactNode;
  /** One or two `SnapPill`s, sharing the row. */
  actions?: ReactNode;
  testID?: string;
}

/**
 * A white card pinned above the home indicator on the Snap backdrop: what happened, what it
 * means, and the way on. Announced politely when it appears.
 */
export function StatusCard({ title, message, details, actions, testID }: StatusCardProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.card,
        {
          bottom: insets.bottom + space.lg + space.sm,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.card,
        },
      ]}
      {...(testID ? { testID } : {})}
    >
      <Text variant="title2" accessibilityRole="header">
        {title}
      </Text>
      <Text tone="muted">{message}</Text>
      {details}
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { position: 'absolute', left: space.lg, right: space.lg, padding: space.xl, gap: space.sm },
  actions: { flexDirection: 'row', gap: space.sm + space.xxs, marginTop: space.sm },
});
