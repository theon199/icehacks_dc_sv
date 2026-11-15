/**
 * Famara design tokens. Every color, space, radius, type style and motion value used in the app
 * comes from here (through `useTheme()` for anything that changes with appearance).
 */
import type { TextStyle } from 'react-native';

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
  /** Glyphs and copy laid over photography: white in both appearances. */
  onImage: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  primarySoft: string;
  onPrimarySoft: string;
  accent: string;
  onAccent: string;
  accentSoft: string;
  onAccentSoft: string;
  /** Selection and the single emphasis moment on a screen (selected chips, active day). */
  highlight: string;
  onHighlight: string;
  highlightSoft: string;
  onHighlightSoft: string;
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
  /** Hairline edge of a solid (non-glass) floating control; real glass draws its own edge. */
  controlBorder: string;
  /** Pressed row wash and faint dividers inside glass menus and trays. */
  hairline: string;
  /** Frost tint laid on glass surfaces that carry text (menus, sheets, toasts). */
  glassFrost: string;
  skeleton: string;
  skeletonHighlight: string;
  shadow: string;
}

export const palettes: Record<ColorScheme, Palette> = {
  /**
   * Soft monochrome: a pale stone canvas, white cards, near-black ink for primary actions, and one
   * lime highlight reserved for selection and the moment that matters on a screen.
   */
  light: {
    background: '#EFEFED',
    surface: '#FFFFFF',
    surfaceSunken: '#F5F5F2',
    surfaceRaised: '#FFFFFF',
    border: '#E8E8EC',
    borderStrong: '#8E9096',
    text: '#17191B',
    textMuted: '#62676D',
    textSubtle: '#62676D',
    textInverse: '#FFFFFF',
    onImage: '#FFFFFF',
    primary: '#17191B',
    primaryPressed: '#2E3135',
    onPrimary: '#FFFFFF',
    primarySoft: '#E6E7E2',
    onPrimarySoft: '#17191B',
    accent: '#B8463A',
    onAccent: '#FFFFFF',
    accentSoft: '#F9E7E5',
    onAccentSoft: '#7A2E25',
    highlight: '#D0F64A',
    onHighlight: '#17191B',
    highlightSoft: '#EDF4DA',
    onHighlightSoft: '#3E5200',
    success: '#3F6E12',
    successSoft: '#EDF4DA',
    onSuccessSoft: '#3E5200',
    warning: '#8A5A00',
    warningSoft: '#FBEFD5',
    onWarningSoft: '#5E3D00',
    danger: '#B3261E',
    dangerPressed: '#8C1D17',
    onDanger: '#FFFFFF',
    dangerSoft: '#F9E7E5',
    onDangerSoft: '#7D1A14',
    focus: '#17191B',
    scrim: 'rgba(20, 20, 22, 0.42)',
    controlBorder: 'rgba(20, 20, 22, 0.08)',
    hairline: 'rgba(20, 20, 22, 0.06)',
    glassFrost: 'rgba(255, 255, 255, 0.52)',
    skeleton: '#E4E4E1',
    skeletonHighlight: '#F1F1EE',
    shadow: '#0F0F14',
  },
  /** The same system on a night canvas: ink and paper swap, the lime highlight stays. */
  dark: {
    background: '#111213',
    surface: '#1F2123',
    surfaceSunken: '#191B1D',
    surfaceRaised: '#2A2C2F',
    border: '#2E3134',
    borderStrong: '#6E7378',
    text: '#F4F4F2',
    textMuted: '#A9AEB3',
    textSubtle: '#A9AEB3',
    textInverse: '#17191B',
    onImage: '#FFFFFF',
    primary: '#F4F4F2',
    primaryPressed: '#D9DAD6',
    onPrimary: '#17191B',
    primarySoft: '#2E3134',
    onPrimarySoft: '#F4F4F2',
    accent: '#F08A7E',
    onAccent: '#2A0D09',
    accentSoft: '#3A221F',
    onAccentSoft: '#FFC9C2',
    highlight: '#D0F64A',
    onHighlight: '#17191B',
    highlightSoft: '#2B3317',
    onHighlightSoft: '#D9F57A',
    success: '#A8D86A',
    successSoft: '#2B3317',
    onSuccessSoft: '#D9F57A',
    warning: '#F2C46B',
    warningSoft: '#3A2D14',
    onWarningSoft: '#F8DDA6',
    danger: '#FF8A7E',
    dangerPressed: '#FFB2A9',
    onDanger: '#3D0A06',
    dangerSoft: '#40201C',
    onDangerSoft: '#FFC9C2',
    focus: '#D0F64A',
    scrim: 'rgba(0, 0, 0, 0.6)',
    controlBorder: 'rgba(255, 255, 255, 0.12)',
    hairline: 'rgba(255, 255, 255, 0.08)',
    glassFrost: 'rgba(31, 33, 35, 0.52)',
    skeleton: '#26282B',
    skeletonHighlight: '#303236',
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
  /** Between page sections. */
  section: 28,
  xxxl: 32,
  /** Before a closing block, e.g. the last action on a long page. */
  sectionLarge: 40,
  huge: 48,
  giant: 64,
} as const;
export type SpaceToken = keyof typeof space;

/** Screen edge padding used by `Screen` and headers. */
/**
 * Initial discs for people without a photo. Fixed in both schemes: each pairs a muted fill with the
 * letter colour that reads on it.
 */
export const avatarDiscs = [
  { fill: '#17191B', ink: '#FFFFFF' },
  { fill: '#9EC49A', ink: '#17191B' },
  { fill: '#C9A2B0', ink: '#17191B' },
  { fill: '#E9C46A', ink: '#17191B' },
  { fill: '#62676D', ink: '#FFFFFF' },
] as const;

export const gutter = space.lg;

export const radii = {
  xs: 6,
  sm: 10,
  md: 12,
  lg: 20,
  /** Medium tiles: list cards, thumbnails beside text. */
  tile: 22,
  xl: 28,
  /** Same as `xl`: feature cards, deck cards, day cards. */
  card: 28,
  /** Bottom sheets and full-bleed hero cards. */
  sheet: 32,
  pill: 999,
} as const;
export type RadiusToken = keyof typeof radii;

/** Minimum touch target (Apple HIG). */
export const minTouchTarget = 44;

/** Font family names, matching the keys registered in `fonts.ts`. One family across the product. */
export const fontFamily = {
  display: 'PlusJakartaSans-Bold',
  displayBold: 'PlusJakartaSans-Bold',
  text: 'PlusJakartaSans-Regular',
  textMedium: 'PlusJakartaSans-Medium',
  textSemiBold: 'PlusJakartaSans-SemiBold',
  textBold: 'PlusJakartaSans-Bold',
} as const;

export type TextVariant =
  | 'displayLarge'
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
  | 'sectionLabel'
  | 'overline';

type TypeStyle = Required<Pick<TextStyle, 'fontFamily' | 'fontSize' | 'lineHeight'>> &
  Pick<TextStyle, 'letterSpacing' | 'textTransform'>;

export const typography: Record<TextVariant, TypeStyle> = {
  displayLarge: { fontFamily: fontFamily.display, fontSize: 48, lineHeight: 56 },
  display: { fontFamily: fontFamily.display, fontSize: 32, lineHeight: 38 },
  title1: { fontFamily: fontFamily.display, fontSize: 24, lineHeight: 30 },
  title2: { fontFamily: fontFamily.textSemiBold, fontSize: 19, lineHeight: 25 },
  title3: { fontFamily: fontFamily.textSemiBold, fontSize: 17, lineHeight: 23 },
  headline: { fontFamily: fontFamily.textSemiBold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fontFamily.text, fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontFamily: fontFamily.textSemiBold, fontSize: 16, lineHeight: 23 },
  callout: { fontFamily: fontFamily.text, fontSize: 15, lineHeight: 21 },
  subhead: { fontFamily: fontFamily.text, fontSize: 14, lineHeight: 20 },
  footnote: { fontFamily: fontFamily.text, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fontFamily.textMedium, fontSize: 12, lineHeight: 16 },
  label: { fontFamily: fontFamily.textSemiBold, fontSize: 14, lineHeight: 18 },
  /** A section label in sentence case. */
  sectionLabel: { fontFamily: fontFamily.textBold, fontSize: 13, lineHeight: 18 },
  overline: {
    fontFamily: fontFamily.textBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
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
  /** Long, faint shadows: cards read as tactile paper rather than floating tiles. */
  low: {
    shadowOpacity: 0.03,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  medium: {
    shadowOpacity: 0.035,
    shadowRadius: 36,
    shadowOffset: { width: 0, height: 12 },
    elevation: 3,
  },
  high: {
    shadowOpacity: 0.055,
    shadowRadius: 36,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
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
