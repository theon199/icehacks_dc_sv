/**
 * Famara design tokens. Every color, space, radius, type style and motion value used in the app
 * comes from here (through `useTheme()` for anything that changes with appearance).
 */
import type { TextStyle } from 'react-native';

import { brandColors } from './brandColors';

export type ColorScheme = 'light' | 'dark';

export interface Palette {
  /** App canvas behind everything. */
  background: string;
  /** Cards, sheets, list rows. */
  surface: string;
  /** Recessed areas: inputs, segmented control tracks, skeletons. */
  surfaceSunken: string;
  /** Surfaces that sit above `surface` (menus, toasts). */
  surfaceRaised: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  textInverse: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  primarySoft: string;
  onPrimarySoft: string;
  accent: string;
  onAccent: string;
  accentSoft: string;
  onAccentSoft: string;
  highlight: string;
  success: string;
  successSoft: string;
  onSuccessSoft: string;
  warning: string;
  warningSoft: string;
  onWarningSoft: string;
  danger: string;
  dangerPressed: string;
  onDanger: string;
  dangerSoft: string;
  onDangerSoft: string;
  focus: string;
  scrim: string;
  skeleton: string;
  skeletonHighlight: string;
  shadow: string;
}

export const palettes: Record<ColorScheme, Palette> = {
  light: {
    background: brandColors.oat,
    surface: brandColors.cream,
    surfaceSunken: '#F1EADF',
    surfaceRaised: '#FFFFFF',
    border: '#E4D9C8',
    borderStrong: '#8E8270',
    text: brandColors.ink,
    textMuted: '#5A5145',
    textSubtle: '#6E6455',
    textInverse: '#FFFDF9',
    primary: brandColors.basil,
    primaryPressed: brandColors.basilDeep,
    onPrimary: '#FFFFFF',
    primarySoft: '#E2EFE7',
    onPrimarySoft: '#1E4A36',
    accent: brandColors.paprika,
    onAccent: '#FFFFFF',
    accentSoft: '#FBE6DC',
    onAccentSoft: '#7A2E17',
    highlight: brandColors.saffron,
    success: '#2D6E48',
    successSoft: '#E1F0E6',
    onSuccessSoft: '#1D4A30',
    warning: '#8A5A00',
    warningSoft: '#FBEFD5',
    onWarningSoft: '#5E3D00',
    danger: '#B3261E',
    dangerPressed: '#8C1D17',
    onDanger: '#FFFFFF',
    dangerSoft: '#FBE4E1',
    onDangerSoft: '#7D1A14',
    focus: '#2F6A4F',
    scrim: 'rgba(20, 16, 10, 0.45)',
    skeleton: '#EDE5D8',
    skeletonHighlight: '#F7F2EA',
    shadow: '#3B2A14',
  },
  dark: {
    background: brandColors.night,
    surface: '#1E1B17',
    surfaceSunken: '#26221D',
    surfaceRaised: '#2A2621',
    border: '#3A342C',
    borderStrong: '#857A6A',
    text: '#F6F0E7',
    textMuted: '#CFC5B6',
    textSubtle: '#ABA090',
    textInverse: brandColors.ink,
    primary: brandColors.basilLight,
    primaryPressed: '#B4E4C9',
    onPrimary: '#0F2A1D',
    primarySoft: '#1F3529',
    onPrimarySoft: '#BFE8D0',
    accent: brandColors.paprikaLight,
    onAccent: '#3A1406',
    accentSoft: '#3D2219',
    onAccentSoft: '#FFD3C0',
    highlight: brandColors.saffronLight,
    success: '#8FD3AE',
    successSoft: '#1F3529',
    onSuccessSoft: '#BFE8D0',
    warning: '#F2C46B',
    warningSoft: '#3A2D14',
    onWarningSoft: '#F8DDA6',
    danger: '#FF8A7E',
    dangerPressed: '#FFB2A9',
    onDanger: '#3D0A06',
    dangerSoft: '#40201C',
    onDangerSoft: '#FFC9C2',
    focus: '#8FD3AE',
    scrim: 'rgba(0, 0, 0, 0.6)',
    skeleton: '#2A2621',
    skeletonHighlight: '#353029',
    shadow: '#000000',
  },
};

/** 4-point spacing scale. */
export const space = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
  giant: 64,
} as const;
export type SpaceToken = keyof typeof space;

/** Screen edge padding used by `Screen` and headers. */
export const gutter = space.lg;

export const radii = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;
export type RadiusToken = keyof typeof radii;

/** Minimum touch target (Apple HIG). */
export const minTouchTarget = 44;

/** Font family names, matching the keys registered in `fonts.ts`. */
export const fontFamily = {
  display: 'Fraunces-SemiBold',
  displayBold: 'Fraunces-Bold',
  text: 'Figtree-Regular',
  textMedium: 'Figtree-Medium',
  textSemiBold: 'Figtree-SemiBold',
  textBold: 'Figtree-Bold',
} as const;

export type TextVariant =
  | 'display'
  | 'title1'
  | 'title2'
  | 'title3'
  | 'headline'
  | 'body'
  | 'bodyStrong'
  | 'callout'
  | 'subhead'
  | 'footnote'
  | 'caption'
  | 'label'
  | 'overline';

type TypeStyle = Required<Pick<TextStyle, 'fontFamily' | 'fontSize' | 'lineHeight'>> &
  Pick<TextStyle, 'letterSpacing' | 'textTransform'>;

export const typography: Record<TextVariant, TypeStyle> = {
  display: { fontFamily: fontFamily.display, fontSize: 34, lineHeight: 40, letterSpacing: -0.4 },
  title1: { fontFamily: fontFamily.display, fontSize: 28, lineHeight: 34, letterSpacing: -0.3 },
  title2: { fontFamily: fontFamily.display, fontSize: 22, lineHeight: 28, letterSpacing: -0.2 },
  title3: { fontFamily: fontFamily.textBold, fontSize: 19, lineHeight: 24 },
  headline: { fontFamily: fontFamily.textSemiBold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fontFamily.text, fontSize: 17, lineHeight: 24 },
  bodyStrong: { fontFamily: fontFamily.textSemiBold, fontSize: 17, lineHeight: 24 },
  callout: { fontFamily: fontFamily.text, fontSize: 16, lineHeight: 22 },
  subhead: { fontFamily: fontFamily.textMedium, fontSize: 15, lineHeight: 20 },
  footnote: { fontFamily: fontFamily.text, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fontFamily.textMedium, fontSize: 12, lineHeight: 16 },
  label: { fontFamily: fontFamily.textSemiBold, fontSize: 16, lineHeight: 20 },
  overline: {
    fontFamily: fontFamily.textBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
};

/** Upper bound for Dynamic Type scaling so dense layouts stay usable at the largest sizes. */
export const maxFontSizeMultiplier = 1.6;

export interface Elevation {
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
}

export const elevation: Record<'none' | 'low' | 'medium' | 'high', Elevation> = {
  none: { shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
  low: {
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  medium: {
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  high: {
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
};

export const motion = {
  duration: { instant: 90, fast: 160, base: 240, slow: 380, deliberate: 560 },
  /** Cubic-bezier control points, usable with Reanimated `Easing.bezier(...)`. */
  easing: {
    standard: [0.2, 0, 0, 1] as const,
    emphasized: [0.3, 0, 0, 1] as const,
    exit: [0.4, 0, 1, 1] as const,
  },
  spring: {
    gentle: { damping: 20, stiffness: 180, mass: 1 },
    snappy: { damping: 18, stiffness: 320, mass: 0.8 },
  },
  /** Scale applied to pressable surfaces while pressed. */
  pressScale: 0.97,
} as const;

export interface Theme {
  scheme: ColorScheme;
  colors: Palette;
  space: typeof space;
  radii: typeof radii;
  typography: typeof typography;
  elevation: typeof elevation;
  motion: typeof motion;
}

export function buildTheme(scheme: ColorScheme): Theme {
  return {
    scheme,
    colors: palettes[scheme],
    space,
    radii,
    typography,
    elevation,
    motion,
  };
}

export const themes: Record<ColorScheme, Theme> = {
  light: buildTheme('light'),
  dark: buildTheme('dark'),
};
