import { memo } from 'react';
import { StyleSheet } from 'react-native';

import { Icon, PressableScale, useTheme, type IconName } from '@/ui';

/** Diameter of a round action; also its whole touch target. */
export const ROUND_ACTION_SIZE = 48;

export interface RoundActionProps {
  icon: IconName;
  label: string;
  hint: string;
  onPress: () => void;
  /** A toggle that is on: the circle fills with the highlight. Omit for a plain action. */
  active?: boolean;
  testID?: string;
}

/** One of the recipe overview's round actions: an equal circle whose label is spoken only. */
export const RoundAction = memo(function RoundAction({
  icon,
  label,
  hint,
  onPress,
  active,
  testID,
}: RoundActionProps) {
  const theme = useTheme();
  const on = active === true;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      {...(active === undefined ? {} : { accessibilityState: { selected: active } })}
      onPress={onPress}
      style={[
        styles.circle,
        { backgroundColor: on ? theme.colors.highlight : theme.colors.surfaceSunken },
      ]}
      {...(testID === undefined ? {} : { testID })}
    >
      <Icon name={icon} size={22} color={on ? 'onHighlight' : 'text'} />
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  circle: {
    width: ROUND_ACTION_SIZE,
    height: ROUND_ACTION_SIZE,
    borderRadius: ROUND_ACTION_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
