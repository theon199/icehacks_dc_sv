import { StyleSheet, View } from 'react-native';

import { Button, Text, radii, space, useTheme } from '@/ui';

import { ACTION_HEIGHT } from './metrics';

export interface NoticeCardProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Read out as soon as it appears (errors). */
  alert?: boolean;
  testID?: string;
}

/** A white card that says why there is no list, with the one thing to do about it. */
export function NoticeCard({
  title,
  message,
  actionLabel,
  onAction,
  alert = false,
  testID,
}: NoticeCardProps) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={[styles.card, { backgroundColor: theme.colors.surface }]}
      {...(alert ? { accessibilityRole: 'alert' as const } : {})}
    >
      <Text variant="headline" accessibilityRole="header">
        {title}
      </Text>
      <Text variant="body" tone="muted">
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.xl, gap: space.md, marginTop: space.md },
  action: { height: ACTION_HEIGHT },
});
