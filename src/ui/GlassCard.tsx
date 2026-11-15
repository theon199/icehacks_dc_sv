import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { withAlpha } from './color';
import { GlassSurface } from './GlassSurface';
import { useTheme } from './ThemeProvider';
import { space, type Elevation, type Theme } from './tokens';

export type GlassCardTone = 'default' | 'accent';

export interface GlassCardProps {
  children: ReactNode;
  /** `accent` marks the one card on a screen that carries its main moment, in the lime highlight. */
  tone?: GlassCardTone;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** How much of the card colour the frost keeps: enough for body copy to read over the canvas. */
const FROST_ALPHA = 0.62;
/** The accent card keeps most of the lime so dark copy on it stays legible. */
const ACCENT_ALPHA = 0.75;

/** A tighter, slightly darker lift than the plain card, so the lime card reads as pressed paper. */
const ACCENT_ELEVATION: Elevation = {
  shadowOpacity: 0.05,
  shadowRadius: 20,
  shadowOffset: { width: 0, height: 8 },
  elevation: 3,
};

/**
 * The frost laid into the material. Light mode lifts the white card colour; dark mode uses the
 * palette's own frost, since a white wash would grey out the night canvas.
 */
export function glassCardTint(theme: Theme, tone: GlassCardTone): string {
  if (tone === 'accent') return withAlpha(theme.colors.highlight, ACCENT_ALPHA);
  return theme.scheme === 'dark'
    ? theme.colors.glassFrost
    : withAlpha(theme.colors.surface, FROST_ALPHA);
}

/**
 * The grouped-content card of the community, moderation and account pages: Liquid Glass with a
 * frost tint on iOS 26, a solid card elsewhere (white, or the highlight for `accent`). The body is
 * padded and spaced so a heading, a sentence and a button stack without extra wrappers.
 *
 * The surface does not clip, so its soft card shadow stays visible around the material.
 */
export function GlassCard({ children, tone = 'default', style, testID }: GlassCardProps) {
  const theme = useTheme();
  const accent = tone === 'accent';
  const lift = accent ? ACCENT_ELEVATION : theme.elevation.medium;

  return (
    <GlassSurface
      radius="card"
      tint={glassCardTint(theme, tone)}
      fallbackColor={accent ? 'highlight' : 'surface'}
      style={[styles.card, { ...lift, shadowColor: theme.colors.shadow }, style]}
      {...(testID === undefined ? {} : { testID })}
    >
      <View style={styles.body} {...(testID === undefined ? {} : { testID: `${testID}-body` })}>
        {children}
      </View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'visible' },
  body: { gap: space.xl, padding: space.section },
});
