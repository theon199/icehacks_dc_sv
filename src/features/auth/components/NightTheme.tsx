import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';

import { ThemeProvider } from '@/ui';

/**
 * The night look of the signed-out surfaces (welcome, the account sheet, the account forms and
 * the age gate). These are the only raw colors in the feature: everything else comes from the
 * dark theme, which `NightTheme` forces for these screens whatever the appearance setting.
 */
export const night = {
  /** Behind the welcome carousel and the age gate. */
  black: '#000000',
  canvas: '#111213',
  /** Tiles on the welcome carousel before their photo arrives. */
  raised: '#1F2123',
  /** Text and glyphs on night surfaces. */
  ink: '#FFFFFF',
  inkMuted: 'rgba(255, 255, 255, 0.62)',
  inkFaint: 'rgba(255, 255, 255, 0.42)',
  hairline: 'rgba(255, 255, 255, 0.14)',
  /** Wells: text fields, the year wheel, secondary pills and notices. */
  field: 'rgba(255, 255, 255, 0.07)',
  /** Round controls and the picked row of the year wheel. */
  control: 'rgba(255, 255, 255, 0.10)',
  /** Dims the welcome carousel while the account sheet is up. */
  scrim: 'rgba(0, 0, 0, 0.55)',
  /** Tint inside the account sheet's dark glass. */
  sheet: 'rgba(30, 32, 34, 0.78)',
  /** The account sheet where Liquid Glass is unavailable. */
  sheetSolid: 'rgba(26, 28, 30, 0.96)',
  /** Fades over dish photos that keep white copy legible. */
  tileFade: 'rgba(8, 9, 10, 0.72)',
  tileFadeTop: 'rgba(8, 9, 10, 0.30)',
  tileFadeClear: 'rgba(8, 9, 10, 0)',
  /** Small dark capsule over a photo. */
  photoPill: 'rgba(12, 14, 12, 0.46)',
  photoPillBorder: 'rgba(255, 255, 255, 0.28)',
  /** Failure glyph in a notice. */
  alert: '#E5675C',
} as const;

/** Renders its children in the dark theme with light status bar text. */
export function NightTheme({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider scheme="dark">
      <StatusBar style="light" />
      {children}
    </ThemeProvider>
  );
}
