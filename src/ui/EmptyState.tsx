import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';
import { space } from './tokens';

export interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
  /** Extra content under the action, e.g. a secondary link. */
  children?: ReactNode;
  tone?: 'neutral' | 'danger';
  style?: StyleProp<ViewStyle>;
}

/** Friendly centred message for empty lists and first-run states. */
export function EmptyState({
  title,
  message,
  icon = 'sparkles',
  actionLabel,
  onAction,
  children,
  tone = 'neutral',
  style,
}: EmptyStateProps) {
  const theme = useTheme();
  const danger = tone === 'danger';
  return (
    <View style={[styles.container, style]}>
      <View
        style={[
          styles.badge,
          { backgroundColor: danger ? theme.colors.dangerSoft : theme.colors.primarySoft },
        ]}
      >
        <Icon name={icon} size={30} color={danger ? 'danger' : 'onPrimarySoft'} />
      </View>
      <View style={styles.text}>
        <Text variant="title3" align="center">
          {title}
        </Text>
        {message ? (
          <Text variant="callout" tone="muted" align="center">
            {message}
          </Text>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant={danger ? 'secondary' : 'primary'} />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
    paddingVertical: space.xxxl,
    paddingHorizontal: space.xl,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { gap: space.sm, maxWidth: 340 },
});
