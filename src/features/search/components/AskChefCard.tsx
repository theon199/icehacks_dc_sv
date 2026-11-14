import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, PressableScale, Text, useTheme } from '@/ui';
import { space } from '@/ui/tokens';

export interface AskChefCardProps {
  onPress: () => void;
}

/** A dark card above the browse grid that switches the tab to the Chef segment. */
export const AskChefCard = memo(function AskChefCard({ onPress }: AskChefCardProps) {
  const theme = useTheme();
  return (
    <PressableScale
      testID="ask-chef-card"
      accessibilityRole="button"
      accessibilityLabel="Ask Chef"
      accessibilityHint="Opens the Chef chat"
      onPress={onPress}
      style={[styles.card, { backgroundColor: theme.colors.primary, borderRadius: theme.radii.xl }]}
    >
      <View style={[styles.disc, styles.big, { backgroundColor: theme.colors.highlight }]}>
        <Icon name="sparkles" android="auto_awesome" size={24} color="onHighlight" />
      </View>
      <View style={styles.text}>
        <Text variant="title3" color="onPrimary" accessible={false}>
          Ask Chef
        </Text>
        <Text variant="subhead" color="onPrimary" style={styles.muted} accessible={false}>
          Swaps, techniques, or what to make with what you have
        </Text>
      </View>
      <View style={[styles.disc, styles.small, { backgroundColor: theme.colors.highlight }]}>
        <Icon
          name="chevron.right"
          android="chevron_right"
          size={14}
          color="onHighlight"
          weight="bold"
        />
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingVertical: space.lg,
    paddingLeft: space.lg,
    paddingRight: space.xl,
  },
  disc: { alignItems: 'center', justifyContent: 'center' },
  big: { width: 52, height: 52, borderRadius: 26 },
  small: { width: 36, height: 36, borderRadius: 18 },
  text: { flex: 1, gap: space.xxs },
  muted: { opacity: 0.72 },
});
