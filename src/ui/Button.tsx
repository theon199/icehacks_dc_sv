import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { haptics, type ImpactStrength } from '@/lib/haptics';

import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { useTheme } from './ThemeProvider';
import { minTouchTarget, type Palette } from './tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Haptic on press; `false` turns it off. */
  haptic?: ImpactStrength | false;
  /** Extra context for VoiceOver, read after the label. */
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const sizeStyle: Record<ButtonSize, { height: number; paddingHorizontal: number; icon: number }> = {
  sm: { height: 36, paddingHorizontal: 14, icon: 16 },
  md: { height: 48, paddingHorizontal: 20, icon: 18 },
  lg: { height: 56, paddingHorizontal: 24, icon: 20 },
};

const variantColors: Record<
  ButtonVariant,
  {
    bg: keyof Palette | null;
    pressed: keyof Palette | null;
    fg: keyof Palette;
    border?: keyof Palette;
  }
> = {
  primary: { bg: 'primary', pressed: 'primaryPressed', fg: 'onPrimary' },
  secondary: { bg: 'surface', pressed: 'surfaceSunken', fg: 'primary', border: 'border' },
  ghost: { bg: null, pressed: 'surfaceSunken', fg: 'primary' },
  destructive: { bg: 'danger', pressed: 'dangerPressed', fg: 'onDanger' },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  haptic = 'light',
  accessibilityHint,
  testID,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const colors = variantColors[variant];
  const dims = sizeStyle[size];
  const inactive = disabled || loading;

  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      hitSlop={dims.height < minTouchTarget ? (minTouchTarget - dims.height) / 2 : 0}
      onPress={() => {
        if (haptic) haptics.impact(haptic);
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        {
          height: dims.height,
          paddingHorizontal: dims.paddingHorizontal,
          borderRadius: theme.radii.pill,
          backgroundColor:
            pressed && colors.pressed
              ? theme.colors[colors.pressed]
              : colors.bg
                ? theme.colors[colors.bg]
                : 'transparent',
          borderWidth: colors.border ? StyleSheet.hairlineWidth * 2 : 0,
          borderColor: colors.border ? theme.colors[colors.border] : 'transparent',
          opacity: disabled ? 0.45 : 1,
          alignSelf: fullWidth ? 'stretch' : 'auto',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors[colors.fg]} />
      ) : (
        <View style={styles.content}>
          {icon ? <Icon name={icon} size={dims.icon} color={colors.fg} weight="semibold" /> : null}
          <Text
            variant={size === 'sm' ? 'subhead' : 'label'}
            color={colors.fg}
            numberOfLines={1}
            accessible={false}
          >
            {label}
          </Text>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
