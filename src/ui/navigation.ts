/**
 * Shared native-stack options so every navigator in `src/app` looks the same.
 */
import type { NativeStackNavigationOptions } from 'expo-router';
import { useMemo } from 'react';
import { Platform } from 'react-native';

import { useTheme } from './ThemeProvider';
import { fontFamily, type Theme } from './tokens';

export interface StackLook {
  /** Large collapsing titles over a translucent bar (tab roots). */
  largeTitle?: boolean;
  /** Hide the header entirely (auth, onboarding, full-screen flows). */
  headerless?: boolean;
}

export function stackScreenOptions(
  theme: Theme,
  look: StackLook = {},
): NativeStackNavigationOptions {
  const { colors } = theme;
  const base: NativeStackNavigationOptions = {
    headerShown: !look.headerless,
    headerTintColor: colors.primary,
    headerTitleStyle: { fontFamily: fontFamily.textSemiBold, color: colors.text },
    headerBackButtonDisplayMode: 'minimal',
    headerShadowVisible: false,
    headerStyle: { backgroundColor: colors.background },
    contentStyle: { backgroundColor: colors.background },
  };
  if (!look.largeTitle) return base;
  return {
    ...base,
    headerLargeTitle: true,
    headerLargeTitleStyle: { fontFamily: fontFamily.display, color: colors.text },
    headerLargeTitleShadowVisible: false,
    ...(Platform.OS === 'ios'
      ? {
          headerTransparent: true,
          headerBlurEffect: 'systemChromeMaterial' as const,
          headerStyle: { backgroundColor: 'transparent' },
          headerLargeStyle: { backgroundColor: 'transparent' },
        }
      : null),
  };
}

/** Memoised stack options for the current theme. */
export function useStackScreenOptions(look: StackLook = {}): NativeStackNavigationOptions {
  const theme = useTheme();
  const { largeTitle = false, headerless = false } = look;
  return useMemo(
    () => stackScreenOptions(theme, { largeTitle, headerless }),
    [theme, largeTitle, headerless],
  );
}

/**
 * Native iOS form sheet. `detents` are fractions of the screen height, smallest first; the person
 * can drag between them.
 */
export function sheetOptions(
  theme: Theme,
  detents: number[] | 'fitToContents' = [0.6, 1],
): NativeStackNavigationOptions {
  return {
    presentation: 'formSheet',
    sheetAllowedDetents: detents,
    sheetGrabberVisible: true,
    sheetCornerRadius: theme.radii.xl,
    headerShown: false,
    contentStyle: { backgroundColor: theme.colors.surface },
  };
}
