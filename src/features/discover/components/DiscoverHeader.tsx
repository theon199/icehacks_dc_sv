import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { IconButton, Text } from '@/ui';
import { gutter, space } from '@/ui/tokens';

import { NotificationBell } from '../deps';

export interface DiscoverHeaderProps {
  onProfile: () => void;
}

/** Screen title with the notifications and profile entry points. */
export const DiscoverHeader = memo(function DiscoverHeader({ onProfile }: DiscoverHeaderProps) {
  return (
    <View style={styles.row}>
      <Text variant="title1" style={styles.title}>
        Discover
      </Text>
      <NotificationBell testID="discover-notifications" />
      <IconButton
        testID="discover-profile"
        icon="person.crop.circle"
        accessibilityLabel="Profile"
        onPress={onProfile}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: gutter,
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
  title: { flex: 1 },
});
