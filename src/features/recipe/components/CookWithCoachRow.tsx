import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Icon,
  PressableScale,
  Text,
  fontFamily,
  radii,
  space,
  useTheme,
  type IconName,
} from '@/ui';

export interface CookWithCoachRowProps {
  title: string;
  onPress: () => void;
}

const DISC = 40;
const SMALL_DISC = 30;
/** The phone set up over the counter, watching. */
const COACH_ICON: IconName = 'iphone';

/**
 * The full-width ink row into the cooking coach: a lime disc, "Cook with coach" and how it works
 * in a few words, and a small lime chevron disc.
 */
export const CookWithCoachRow = memo(function CookWithCoachRow({
  title,
  onPress,
}: CookWithCoachRowProps) {
  const { colors } = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Cook ${title} with coach`}
      accessibilityHint="Set your phone up over the counter and talk to it while you cook"
      pressedScale={0.985}
      onPress={onPress}
      style={[styles.row, { backgroundColor: colors.primary }]}
      testID="recipe-cook-coach"
    >
      <View style={[styles.disc, { backgroundColor: colors.highlight }]}>
        <Icon name={COACH_ICON} size={20} color="onHighlight" />
      </View>
      <View style={styles.copy}>
        <Text variant="headline" color="onPrimary" style={styles.bold} accessible={false}>
          Cook with coach
        </Text>
        <Text variant="caption" color="onPrimary" style={styles.muted} accessible={false}>
          Set your phone up and talk
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
