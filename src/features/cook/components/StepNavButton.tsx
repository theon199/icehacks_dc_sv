import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, PressableScale, Text, minTouchTarget, space, useTheme, type IconName } from '@/ui';

export interface StepNavButtonProps {
  label: string;
  icon: IconName;
  onPress: () => void;
  testID?: string;
}

/** Next step or Done: an ink capsule that fills the rest of the step card's control row. */
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
      <View style={styles.content}>
        <Text variant="headline" color="onPrimary" accessible={false}>
          {label}
        </Text>
        <Icon name={icon} size={16} color="onPrimary" />
      </View>
    </PressableScale>
  );
});

export interface StepBackButtonProps {
  disabled: boolean;
  onPress: () => void;
}

/** The previous-step circle at the start of the control row. */
export const StepBackButton = memo(function StepBackButton({
  disabled,
  onPress,
}: StepBackButtonProps) {
  const theme = useTheme();
  return (
    <PressableScale
      testID="cook-back"
      accessibilityRole="button"
      accessibilityLabel="Previous step"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.circle,
        { backgroundColor: theme.colors.surfaceSunken },
        disabled && styles.disabled,
      ]}
    >
      <Icon name="chevron.left" size={20} color="text" />
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  button: {
    flex: 1,
    minHeight: minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  circle: {
    width: minTouchTarget,
    height: minTouchTarget,
    borderRadius: minTouchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
});
