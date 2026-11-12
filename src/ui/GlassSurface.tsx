import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { withAlpha } from './color';
import { useTheme } from './ThemeProvider';
import type { RadiusToken } from './tokens';

export interface GlassSurfaceProps {
  children?: ReactNode;
  radius?: RadiusToken;
  /** Makes the glass respond to touch (iOS 26). */
  interactive?: boolean;
  style?: StyleProp<ViewStyle>;
}

let liquidGlass: boolean | null = null;
function hasLiquidGlass(): boolean {
  if (liquidGlass == null) {
    try {
      liquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
    } catch {
      liquidGlass = false;
    }
  }
  return liquidGlass;
}

/**
 * Translucent surface for floating controls. Uses Liquid Glass on iOS 26, a system blur on older
 * iOS, and a solid translucent fill elsewhere.
 */
export function GlassSurface({
  children,
  radius = 'lg',
  interactive = false,
  style,
}: GlassSurfaceProps) {
  const theme = useTheme();
  const shape = { borderRadius: theme.radii[radius], overflow: 'hidden' as const };

  if (hasLiquidGlass()) {
    return (
      <GlassView glassEffectStyle="regular" isInteractive={interactive} style={[shape, style]}>
        {children}
      </GlassView>
    );
  }
  if (Platform.OS === 'ios') {
    return (
      <BlurView
        intensity={60}
        tint={theme.scheme === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
        style={[shape, style]}
      >
        {children}
      </BlurView>
    );
  }
  return (
    <View
      style={[
        shape,
        {
          backgroundColor: withAlpha(theme.colors.surfaceRaised, 0.94),
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
