import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from './PressableScale';
import { useTheme } from './ThemeProvider';
import type { SpaceToken } from './tokens';

export interface CardProps {
  children: ReactNode;
  /** Makes the whole card a button. Provide `accessibilityLabel` when pressable. */
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  padding?: SpaceToken;
  variant?: 'elevated' | 'outlined' | 'sunken';
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/** Rounded content container. Elevated cards use a soft shadow in light mode and a border in dark. */
export function Card({
  children,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  padding = 'lg',
  variant = 'elevated',
  testID,
  style,
}: CardProps) {
  const theme = useTheme();
  const dark = theme.scheme === 'dark';
  const bordered = variant === 'outlined' || (variant === 'elevated' && dark);
  const surface: ViewStyle = {
    borderRadius: theme.radii.lg,
    padding: theme.space[padding],
    backgroundColor: variant === 'sunken' ? theme.colors.surfaceSunken : theme.colors.surface,
    borderWidth: bordered ? StyleSheet.hairlineWidth : 0,
    borderColor: theme.colors.border,
    ...(variant === 'elevated' && !dark
      ? { ...theme.elevation.low, shadowColor: theme.colors.shadow }
      : null),
  };

  if (!onPress) {
    return (
      <View testID={testID} style={[surface, style]}>
        {children}
      </View>
    );
  }
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      pressedScale={0.985}
      style={[surface, style]}
    >
      {children}
    </PressableScale>
  );
}
