import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, PressableScale, Text, fontFamily, space, useTheme } from '@/ui';

import { ChefHat } from '../deps';

export interface AskChefCardProps {
  onPress: () => void;
}

/**
 * The way into Chef from Search: an ink card with Chef's toque on a lime disc and a lime chevron.
 * Callers leave it out when Chef is not available to the account.
 */
export const AskChefCard = memo(function AskChefCard({ onPress }: AskChefCardProps) {
  const theme = useTheme();
  return (
    <PressableScale
      testID="ask-chef-card"
      accessibilityRole="button"
      accessibilityLabel="Ask Chef"
      accessibilityHint="Recipes, techniques, whatever's in the fridge"
      onPress={onPress}
      style={[
        styles.card,
        { backgroundColor: theme.colors.primary, borderRadius: theme.radii.tile },
      ]}
    >
      <View style={[styles.disc, { backgroundColor: theme.colors.highlight }]}>
        <ChefHat size={26} color="onHighlight" />
      </View>
      <View style={styles.copy}>
        <Text
          variant="headline"
          color="onPrimary"
          numberOfLines={1}
          accessible={false}
          style={styles.title}
        >
          Ask Chef
        </Text>
        <Text
          variant="subhead"
          color="onPrimary"
          numberOfLines={2}
          accessible={false}
          style={styles.muted}
        >
          Recipes, techniques, whatever&rsquo;s in the fridge
        </Text>
      </View>
      <View style={[styles.chevron, { backgroundColor: theme.colors.highlight }]}>
        <Icon name="chevron.right" size={18} color="onHighlight" />
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md + 2,
    minHeight: 88,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  disc: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: fontFamily.textBold },
  muted: { opacity: 0.7 },
  chevron: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
