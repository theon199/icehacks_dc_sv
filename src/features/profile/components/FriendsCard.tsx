import { StyleSheet, View } from 'react-native';

import { Button, space, Text, fontFamily, useTheme } from '@/ui';

export interface FriendsCardProps {
  onOpen: () => void;
}

/** The way into Friends from the profile: who you follow, who follows you and invites. */
export function FriendsCard({ onOpen }: FriendsCardProps) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <Text variant="sectionLabel" tone="muted" accessibilityRole="header">
        Friends
      </Text>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radii.card,
          },
        ]}
      >
        <Text variant="title2" align="center" style={styles.title}>
          Cook with friends
        </Text>
        <Text variant="subhead" tone="muted" align="center">
          See who follows you, follow people back and invite friends to Famara.
        </Text>
        <Button
          label="See your friends"
          icon="person.2"
          fullWidth
          onPress={onOpen}
          testID="profile-friends"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.xl,
    paddingVertical: 26,
    gap: space.md,
    alignItems: 'center',
  },
  title: { fontFamily: fontFamily.textBold, letterSpacing: -0.3 },
});
