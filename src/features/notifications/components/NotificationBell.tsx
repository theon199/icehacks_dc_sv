import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Badge, GlassIconButton, IconButton, type IconButtonProps } from '@/ui';

import { useUnreadCount } from '../queries';

export interface NotificationBellProps {
  /** `glass` when the bell sits beside a tab title. */
  variant?: IconButtonProps['variant'];
  testID?: string;
}

const HINT = 'Likes, comments, follows and updates about your posts';

/** The badge never claims more than this many unread entries; above it reads "9+". */
const MAX_SHOWN = 9;

/**
 * Header button that opens the inbox. In a glass header it is the shared glass circle with the
 * unread count as a red chip riding outside the glass, where the profile circle wears its count.
 */
export function NotificationBell({ variant = 'plain', testID }: NotificationBellProps) {
  const router = useRouter();
  const unread = useUnreadCount();
  const open = () => router.push('/notifications');

  if (variant === 'glass') {
    return (
      <GlassIconButton
        icon="bell"
        accessibilityLabel="Notifications"
        accessibilityHint={HINT}
        onPress={open}
        {...(unread > 0
          ? {
              badge: {
                label: unread > MAX_SHOWN ? `${MAX_SHOWN}+` : String(unread),
                accessibilityLabel: `${unread} unread`,
              },
            }
          : {})}
        {...(testID ? { testID } : {})}
      />
    );
  }

  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';
  return (
    <View>
      <IconButton
        icon={unread > 0 ? 'bell.badge' : 'bell'}
        accessibilityLabel={label}
        variant={variant}
        onPress={open}
        {...(testID ? { testID } : {})}
      />
      {unread > 0 ? (
        <View style={styles.badge} pointerEvents="none" accessible={false}>
          <Badge count={unread} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', top: 0, right: 0 },
});
