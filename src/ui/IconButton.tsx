import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { haptics } from '@/lib/haptics';

import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { useTheme } from './ThemeProvider';
import { minTouchTarget, type Palette } from './tokens';

/**
 * `glass` is the header control: a 44 pt white disc with a faint hairline, used for every round
 * action that sits beside a screen title (profile, filters, create, notifications).
 */
export type IconButtonVariant = 'plain' | 'tinted' | 'filled' | 'glass';

export interface IconButtonProps {
  icon: IconName;
  /** Required: icon-only controls must say what they do. */
  accessibilityLabel: string;
  onPress: () => void;
  variant?: IconButtonVariant;
  size?: number;
  color?: keyof Palette;
  disabled?: boolean;
  selected?: boolean;
  haptic?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const variantBg: Record<IconButtonVariant, keyof Palette | null> = {
  plain: null,
  tinted: 'surfaceSunken',
  filled: 'primary',
  glass: 'surface',
};

/** Round, icon-only button with a 44 pt minimum touch target. */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = 'plain',
  size,
  color,
  disabled = false,
  selected,
  haptic = true,
  testID,
  style,
}: IconButtonProps) {
  const theme = useTheme();
  const bg = variantBg[variant];
  const glass = variant === 'glass';
  const side = size ?? (glass ? minTouchTarget : 40);
  const iconColor = color ?? (variant === 'filled' ? 'onPrimary' : 'text');
  const slop = side < minTouchTarget ? (minTouchTarget - side) / 2 : 0;

  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={selected === undefined ? { disabled } : { disabled, selected }}
      disabled={disabled}
      hitSlop={slop}
      onPress={() => {
        if (haptic) haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        {
          width: side,
          height: side,
          borderRadius: side / 2,
          ...(glass
            ? {
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.colors.border,
                ...theme.elevation.low,
                shadowColor: theme.colors.shadow,
              }
            : null),
          backgroundColor: bg
            ? theme.colors[bg]
            : pressed
              ? theme.colors.surfaceSunken
              : 'transparent',
          opacity: disabled ? 0.4 : pressed && bg ? 0.85 : 1,
          ...(glass && pressed ? { backgroundColor: theme.colors.surfaceSunken } : null),
        },
        style,
      ]}
    >
      <Icon
        name={icon}
        size={Math.round(side * (glass ? 0.45 : 0.5))}
        color={iconColor}
        weight={glass ? 'regular' : 'semibold'}
      />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
