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
  style?: PressableStyle;
  /** Scale while pressed; 1 disables the effect. */
  pressedScale?: number;
}

/**
 * Pressable that gently shrinks while pressed. The animation runs on the UI thread and is skipped
 * when Reduce Motion is on. `style` may be a function of the pressed state.
 */
export function PressableScale({
  children,
  style,
  pressedScale,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  const target = pressedScale ?? theme.motion.pressScale;
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const duration = theme.motion.duration.fast;
  const resolvedStyle = typeof style === 'function' ? style({ pressed }) : style;

  return (
    <AnimatedPressable
      onPressIn={(event) => {
        setPressed(true);
        if (!reduceMotion && target !== 1) scale.set(withTiming(target, { duration }));
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        if (!reduceMotion) scale.set(withTiming(1, { duration }));
        onPressOut?.(event);
      }}
      style={[resolvedStyle, animatedStyle]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
