import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, PressableScale, Text, space, useTheme } from '@/ui';

export interface CookButtonProps {
  onPress: () => void;
  testID?: string;
}

const HEIGHT = 56;
const DISC = 40;

/** The recipe's main action: an ink capsule with a lime arrow disc at its end. */
export const CookButton = memo(function CookButton({ onPress, testID }: CookButtonProps) {
  const theme = useTheme();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Cook now"
      accessibilityHint="Starts the step-by-step cooking guide"
      onPress={onPress}
      style={[
        styles.button,
        {
          backgroundColor: theme.colors.primary,
          borderRadius: theme.radii.pill,
          ...theme.elevation.medium,
          shadowColor: theme.colors.shadow,
        },
      ]}
    >
      <Icon name="frying.pan" android="skillet" size={20} color="onPrimary" />
      <Text variant="headline" color="onPrimary" style={styles.label} accessible={false}>
        Cook now
      </Text>
      <View style={[styles.disc, { backgroundColor: theme.colors.highlight }]}>
        <Icon
          name="arrow.right"
          android="arrow_forward"
          size={18}
          color="onHighlight"
          weight="semibold"
        />
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  button: {
    height: HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingLeft: space.xl,
    paddingRight: space.sm,
  },
  label: { flex: 1 },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
