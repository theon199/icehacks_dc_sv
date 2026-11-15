import { GlassView } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { hasLiquidGlass } from './glass';
import { useTheme } from './ThemeProvider';
import type { Palette, RadiusToken } from './tokens';

export type GlassScheme = 'auto' | 'light' | 'dark';

export interface GlassSurfaceProps {
  /** Corner radius: a radius token or points. */
  radius: RadiusToken | number;
  /**
   * Tint laid into the material. Defaults to the palette's frost, which keeps text on the surface
   * readable; pass `transparent` for untinted system glass.
   */
  tint?: string;
  /**
   * Pins the material's appearance. Glass over a photo or a dark frost passes `dark`; on `auto`
   * it follows the app's appearance and turns milky over imagery.
   */
  scheme?: GlassScheme;
  glassStyle?: 'regular' | 'clear';
  /**
   * Gives the panel the material's touch response, for a surface that hosts its own pressable
   * content such as a text field. Off by default: most surfaces only carry text.
   */
  interactive?: boolean;
  /** Solid colour where Liquid Glass is unavailable. */
  fallbackColor?: keyof Palette;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children?: ReactNode;
}

/**
 * A non-interactive glass panel that carries content (menus, toasts, sheets).
 *
 * On iOS 26 the `GlassView` is the root and the children render inside the material, so a surface
 * can sit directly inside a `GlassContainer` and merge with its neighbours. Elsewhere it is a
 * plain solid panel in `fallbackColor`.
 *
 * Never fade a glass surface or one of its ancestors: a `GlassView` under opacity below 1 renders
 * as an empty outline. Fade the content on top of it, or move it instead.
 */
export function GlassSurface({
  radius,
  tint,
  scheme = 'auto',
  glassStyle = 'regular',
  interactive = false,
  fallbackColor = 'surface',
  style,
  testID,
  children,
}: GlassSurfaceProps) {
  const theme = useTheme();
  const shape = {
    borderRadius: typeof radius === 'number' ? radius : theme.radii[radius],
  };

  if (hasLiquidGlass()) {
    return (
      <GlassView
        glassEffectStyle={glassStyle}
        colorScheme={scheme}
        isInteractive={interactive}
        tintColor={tint ?? theme.colors.glassFrost}
        style={[styles.clip, shape, style]}
        {...(testID === undefined ? {} : { testID })}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <View
      style={[styles.clip, shape, style, { backgroundColor: theme.colors[fallbackColor] }]}
      {...(testID === undefined ? {} : { testID })}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
