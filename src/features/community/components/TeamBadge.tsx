import { StyleSheet, View } from 'react-native';

import { Icon, Text, useTheme } from '@/ui';

export const TEAM_LABEL = 'Famara Team';

/** Marks posts and profiles from the official team account, so they are never mistaken for members. */
export function TeamBadge({ compact = false }: { compact?: boolean }) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${TEAM_LABEL}, official account`}
      style={[
        styles.badge,
        { backgroundColor: theme.colors.primarySoft, borderRadius: theme.radii.pill },
      ]}
    >
      <Icon
        name="checkmark.seal.fill"
        android="verified"
        size={compact ? 12 : 14}
        color="onPrimarySoft"
      />
      {compact ? null : (
        <Text variant="caption" color="onPrimarySoft" accessible={false}>
          {TEAM_LABEL}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
});
