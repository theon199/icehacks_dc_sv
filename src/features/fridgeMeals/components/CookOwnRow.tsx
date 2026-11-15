import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, PressableScale, Text, fontFamily, radii, space, useTheme } from '@/ui';

export interface CookOwnRowProps {
  onPress: () => void;
}

const DISC = 40;
const SMALL_DISC = 30;

/** The ink row that leads out of the catalog: bring in a recipe Famara does not have. */
export const CookOwnRow = memo(function CookOwnRow({ onPress }: CookOwnRowProps) {
  const theme = useTheme();
  const { colors } = theme;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel="Cook something not in Famara"
      accessibilityHint="Add a family recipe, a link or a recipe card"
      pressedScale={0.985}
      onPress={onPress}
      style={[styles.row, { backgroundColor: colors.primary }]}
      testID="fridge-meals-cook-own"
    >
      <View style={[styles.disc, { backgroundColor: colors.highlight }]}>
        <Icon name="book" size={20} color="onHighlight" />
      </View>
      <View style={styles.copy}>
        <Text variant="headline" color="onPrimary" style={styles.bold} accessible={false}>
          Cook something not in Famara
        </Text>
        <Text variant="caption" color="onPrimary" style={styles.muted} accessible={false}>
          A family recipe, a link or a card
        </Text>
      </View>
      <View style={[styles.smallDisc, { backgroundColor: colors.highlight }]}>
        <Icon name="chevron.right" size={16} color="onHighlight" />
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 72,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radii.lg,
  },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallDisc: {
    width: SMALL_DISC,
    height: SMALL_DISC,
    borderRadius: SMALL_DISC / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: space.xxs },
  bold: { fontFamily: fontFamily.textBold },
  muted: { opacity: 0.72 },
});
