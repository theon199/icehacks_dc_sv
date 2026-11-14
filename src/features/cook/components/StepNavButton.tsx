import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, PressableScale, Text, useTheme, type IconName } from '@/ui';

export interface StepNavButtonProps {
  label: string;
  icon: IconName;
  onPress: () => void;
  testID?: string;
}

const HEIGHT = 56;
const DISC = 40;

/** Next or Finish: an ink capsule with a lime disc holding the arrow or check. */
export const StepNavButton = memo(function StepNavButton({
  label,
  icon,
  onPress,
  testID,
}: StepNavButtonProps) {
  const theme = useTheme();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
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
      <Text variant="headline" color="onPrimary" style={styles.label} accessible={false}>
        {label}
      </Text>
      <View style={[styles.disc, { backgroundColor: theme.colors.highlight }]}>
        <Icon name={icon} size={18} color="onHighlight" weight="semibold" />
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  button: {
    flex: 1,
    height: HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 24,
    paddingRight: 8,
  },
  label: { flex: 1, textAlign: 'center', paddingLeft: DISC },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
