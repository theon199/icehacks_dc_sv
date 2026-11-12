import { useState, type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from './ThemeProvider';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableStyle =
  StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);

export interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  children?: ReactNode;
  /**
   * Static styles cost nothing extra. A function of the pressed state re-renders this component on
   * press in and out, so prefer `pressedOpacity` for rows in long lists.
   */
  style?: PressableStyle;
  /** Scale while pressed; 1 disables the effect. */
  pressedScale?: number;
  /** Opacity while pressed, animated on the UI thread; 1 (the default) disables the effect. */
  pressedOpacity?: number;
}

/**
 * Pressable that gently shrinks (and optionally dims) while pressed. The feedback runs on the UI
 * thread from shared values and is skipped when Reduce Motion is on, apart from the dimming, which
 * is not motion.
 */
export function PressableScale({
  children,
  style,
  pressedScale,
  pressedOpacity = 1,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const styleFollowsPress = typeof style === 'function';
  const [pressed, setPressed] = useState(false);
  const target = pressedScale ?? theme.motion.pressScale;
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const dims = pressedOpacity !== 1;
  // Opacity is only animated when dimming is on, so a caller's own opacity (disabled) still wins.
  const animatedStyle = useAnimatedStyle(() =>
    dims
      ? { opacity: opacity.get(), transform: [{ scale: scale.get() }] }
      : { transform: [{ scale: scale.get() }] },
  );
  const duration = theme.motion.duration.fast;
  const resolvedStyle = styleFollowsPress ? style({ pressed }) : style;

  return (
    <AnimatedPressable
      onPressIn={(event) => {
        if (styleFollowsPress) setPressed(true);
        if (!reduceMotion && target !== 1) scale.set(withTiming(target, { duration }));
        if (dims) opacity.set(pressedOpacity);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        if (styleFollowsPress) setPressed(false);
        if (!reduceMotion) scale.set(withTiming(1, { duration }));
        if (dims) opacity.set(withTiming(1, { duration }));
        onPressOut?.(event);
      }}
      style={[resolvedStyle, animatedStyle]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
