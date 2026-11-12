import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Badge, IconButton } from '@/ui';

import { useUnreadCount } from '../queries';

export interface NotificationBellProps {
  testID?: string;
}

/** Header button that opens the inbox, with the unread count on top. */
export function NotificationBell({ testID }: NotificationBellProps) {
  const router = useRouter();
  const unread = useUnreadCount();
  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';
  return (
    <View>
      <IconButton
        icon={unread > 0 ? 'bell.badge' : 'bell'}
        accessibilityLabel={label}
        onPress={() => router.push('/notifications')}
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
