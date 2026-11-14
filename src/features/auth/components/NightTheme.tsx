import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { ThemeProvider } from '@/ui';

/**
 * The night look of the signed-out surfaces (welcome, the sign-in sheet and the account forms).
 * These are the only raw colors in the feature: everything else comes from the dark theme, which
 * `NightTheme` forces for these screens whatever the appearance setting.
 */
export const night = {
  /** Behind the welcome slides. */
  black: '#000000',
  canvas: '#111213',
  raised: '#1F2123',
  hairline: 'rgba(255, 255, 255, 0.14)',
  field: 'rgba(255, 255, 255, 0.06)',
  control: 'rgba(255, 255, 255, 0.12)',
} as const;

/** Secondary pill on a night surface: a faint field with a hairline, for `Button` `style`. */
export const nightOutline = StyleSheet.create({
  pill: {
    backgroundColor: night.field,
    borderColor: night.hairline,
    borderWidth: StyleSheet.hairlineWidth,
  },
}).pill;

/** Renders its children in the dark theme with light status bar text. */
export function NightTheme({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider scheme="dark">
      <StatusBar style="light" />
      {children}
    </ThemeProvider>
  );
}
