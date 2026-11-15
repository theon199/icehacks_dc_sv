import { GlassView } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type AccessibilityRole,
  type AccessibilityState,
  type Insets,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { hasLiquidGlass, splitControlStyle } from './glass';
import type { GlassScheme } from './GlassSurface';
import { useTheme } from './ThemeProvider';
import type { Palette } from './tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** The fallback press spring: quick, slightly damped, settles without a wobble. */
const PRESS_SPRING = { damping: 22, stiffness: 380, mass: 0.65 } as const;

export interface GlassControlProps {
  /** Corner radius in points; half the height for a circle or capsule. */
  radius: number;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  /** See `GlassSurface`: `dark` for controls laid over imagery. */
  scheme?: GlassScheme;
  /** Tint inside the material. Icon controls default to untinted system glass. */
  tint?: string;
  /** `clear` lets more of a photo through; controls over imagery use it. */
  glassStyle?: 'regular' | 'clear';
  /**
   * The material's own press response (default on). Turn it off where the interactive material
   * renders wrong, e.g. over a frosted card back.
   */
  interactive?: boolean;
  disabled?: boolean;
  /** Solid colour where Liquid Glass is unavailable. */
  fallbackColor?: keyof Palette;
  hitSlop?: number | Insets;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children: ReactNode;
}

/**
 * The one pressable glass control.
 *
 * On iOS 26 the `GlassView` is the control's root with the pressable inside it, so the touch lands
 * inside the material and the system's interactive lensing answers the press on the render
 * server. That native response is the only press animation on glass: no JS scale on top and no
 * drop shadow (the material lights its own edge). Because the root is a `GlassView`, a control can
 * sit directly inside a `GlassContainer` and blend with its siblings.
 *
 * Elsewhere it is a solid surface with a soft shadow and a spring press on the UI thread, skipped
 * when Reduce Motion is on.
 */
export function GlassControl({
  radius,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  accessibilityState,
  scheme = 'auto',
  tint,
  glassStyle = 'regular',
  interactive = true,
  disabled = false,
  fallbackColor = 'surface',
  hitSlop,
  style,
  testID,
  children,
}: GlassControlProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  const a11y = {
    accessibilityRole,
    accessibilityLabel,
    accessibilityState: { ...accessibilityState, disabled },
    ...(accessibilityHint === undefined ? {} : { accessibilityHint }),
    ...(hitSlop === undefined ? {} : { hitSlop }),
    ...(testID === undefined ? {} : { testID }),
  };

  if (hasLiquidGlass()) {
    const { shell, content } = splitControlStyle(style);
    return (
      <GlassView
        glassEffectStyle={glassStyle}
        colorScheme={scheme}
        isInteractive={interactive && !disabled}
        style={[{ borderRadius: radius }, shell]}
        {...(tint === undefined ? {} : { tintColor: tint })}
      >
        {/* Disabled dims the content, never the glass: a faded GlassView draws an empty rim. */}
        <Pressable
          {...a11y}
          disabled={disabled}
          onPress={onPress}
          style={[styles.content, content, disabled && styles.disabled]}
        >
          {children}
        </Pressable>
      </GlassView>
    );
  }

  return (
    <AnimatedPressable
      {...a11y}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => {
        if (!reduceMotion) scale.set(withSpring(theme.motion.pressScale, PRESS_SPRING));
      }}
      onPressOut={() => {
        if (!reduceMotion) scale.set(withSpring(1, PRESS_SPRING));
      }}
      style={[
        styles.fallback,
        { borderRadius: radius, ...theme.elevation.low, shadowColor: theme.colors.shadow },
        style,
        disabled && styles.disabled,
        pressStyle,
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: radius, backgroundColor: theme.colors[fallbackColor] },
        ]}
      />
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
});
