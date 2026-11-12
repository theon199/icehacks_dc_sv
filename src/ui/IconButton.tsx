import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { haptics } from '@/lib/haptics';

import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { useTheme } from './ThemeProvider';
import { minTouchTarget, type Palette } from './tokens';

export type IconButtonVariant = 'plain' | 'tinted' | 'filled';

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
};

/** Round, icon-only button with a 44 pt minimum touch target. */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = 'plain',
  size = 40,
  color,
  disabled = false,
  selected,
  haptic = true,
  testID,
  style,
}: IconButtonProps) {
  const theme = useTheme();
  const bg = variantBg[variant];
  const iconColor = color ?? (variant === 'filled' ? 'onPrimary' : 'text');
  const slop = size < minTouchTarget ? (minTouchTarget - size) / 2 : 0;

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
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg
            ? theme.colors[bg]
            : pressed
              ? theme.colors.surfaceSunken
              : 'transparent',
          opacity: disabled ? 0.4 : pressed && bg ? 0.85 : 1,
        },
        style,
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} color={iconColor} weight="semibold" />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
