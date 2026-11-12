import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, IconButton, Text } from '@/ui';
import { gutter, space } from '@/ui/tokens';

export interface DiscoverHeaderProps {
  unread: number;
  onNotifications: () => void;
  onProfile: () => void;
}

/** Screen title with the notifications and profile entry points. */
export const DiscoverHeader = memo(function DiscoverHeader({
  unread,
  onNotifications,
  onProfile,
}: DiscoverHeaderProps) {
  const bellLabel = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';
  return (
    <View style={styles.row}>
      <Text variant="title1" style={styles.title}>
        Discover
      </Text>
      <View>
        <IconButton
          testID="discover-notifications"
          icon="bell"
          accessibilityLabel={bellLabel}
          variant="tinted"
          onPress={onNotifications}
        />
        {unread > 0 ? (
          <View style={styles.badge} pointerEvents="none" accessible={false}>
            <Badge count={unread} />
          </View>
        ) : null}
      </View>
      <IconButton
        testID="discover-profile"
        icon="person.crop.circle"
        accessibilityLabel="Profile"
        variant="tinted"
        onPress={onProfile}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: gutter,
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
  title: { flex: 1 },
  badge: { position: 'absolute', top: -2, right: -2 },
});
