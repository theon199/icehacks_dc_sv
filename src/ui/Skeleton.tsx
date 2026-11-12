import { useEffect, type ReactNode } from 'react';
import { View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from './ThemeProvider';
import type { RadiusToken } from './tokens';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: RadiusToken;
  style?: StyleProp<ViewStyle>;
}

/** Placeholder block that pulses while content loads (static when Reduce Motion is on). */
export function Skeleton({ width = '100%', height = 16, radius = 'sm', style }: SkeletonProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return undefined;
    pulse.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: 1 - pulse.value * 0.45 }));

  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height,
          borderRadius: theme.radii[radius],
          backgroundColor: theme.colors.skeleton,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

export interface SkeletonGroupProps {
  children: ReactNode;
  /** Announced to VoiceOver instead of the individual blocks. */
  label?: string;
  style?: StyleProp<ViewStyle>;
}

/** Wraps skeleton blocks so assistive technology hears one "Loading" element. */
export function SkeletonGroup({ children, label = 'Loading', style }: SkeletonGroupProps) {
  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={[{ gap: 10 }, style]}
    >
      {children}
    </View>
  );
}
