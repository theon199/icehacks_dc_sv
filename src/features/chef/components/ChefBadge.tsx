import { StyleSheet, View } from 'react-native';

import { Text, space, useTheme } from '@/ui';

import { ChefHat } from './ChefHat';

const DISC = 24;

/** "Chef" with the toque on an ink disc: the top line of every answer card. Decorative. */
export function ChefBadge() {
  const theme = useTheme();
  return (
    <View style={styles.row} accessible={false} importantForAccessibility="no-hide-descendants">
      <View style={[styles.disc, { backgroundColor: theme.colors.primary }]}>
        {/* Lime reads on ink; in dark mode the disc turns to paper, so the toque turns to ink. */}
        <ChefHat size={14} color={theme.scheme === 'dark' ? 'onPrimary' : 'highlight'} />
      </View>
      <Text variant="label" tone="muted" accessible={false}>
        Chef
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
