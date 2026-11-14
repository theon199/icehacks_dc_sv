import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

let probed: boolean | null = null;

/**
 * Whether native Liquid Glass can render here: iOS 26 with the glass API present at runtime and
 * the app built for the new design. Probed once and cached; false off iOS, and false when the
 * native module is missing (a development client whose native build lags the JS), so every glass
 * component falls back to a solid surface instead of crashing.
 */
export function hasLiquidGlass(): boolean {
  if (probed !== null) return probed;
  if (Platform.OS !== 'ios') {
    probed = false;
    return probed;
  }
  try {
    probed = isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  } catch {
    probed = false;
  }
  return probed;
}

/** Forgets the cached probe so tests can switch glass on and off per case. */
export function resetLiquidGlassProbe(): void {
  probed = null;
}

/**
 * Keys that lay out a control's own content. On real glass they move from the glass shell onto
 * the pressable inside it, so padding stays part of the touch target instead of a dead rim.
 */
const contentKeys: ReadonlySet<string> = new Set([
  'alignItems',
  'columnGap',
  'flexDirection',
  'flexWrap',
  'gap',
  'justifyContent',
  'padding',
  'paddingBottom',
  'paddingEnd',
  'paddingHorizontal',
  'paddingLeft',
  'paddingRight',
  'paddingStart',
  'paddingTop',
  'paddingVertical',
  'rowGap',
]);

/**
 * Splits a control style into what the glass shell owns (position, size, margins, border) and
 * what the pressable content owns (padding and child alignment).
 */
export function splitControlStyle(style: StyleProp<ViewStyle>): {
  shell: ViewStyle;
  content: ViewStyle;
} {
  const flat: ViewStyle = StyleSheet.flatten(style) ?? {};
  const shell: ViewStyle = {};
  const content: ViewStyle = {};
  for (const [key, value] of Object.entries(flat)) {
    Object.assign(contentKeys.has(key) ? content : shell, { [key]: value });
  }
  return { shell, content };
}
