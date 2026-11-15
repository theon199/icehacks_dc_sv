import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { space, useTheme } from '@/ui';

const DOT = 7;
const PULSE_MS = 600;
const STAGGER_MS = 200;
const DIM = 0.25;

function Dot({ opacity }: { opacity: SharedValue<number> }) {
  const theme = useTheme();
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View style={[styles.dot, { backgroundColor: theme.colors.textMuted }, style]} />;
}

/**
 * Three dots that fade in turn while Chef is answering: a fade, never a bounce. Reduce Motion
 * leaves them still at full strength. Decorative; the caller carries the spoken status.
 */
export function ThinkingDots() {
  const reduceMotion = useReducedMotion();
  const first = useSharedValue(1);
  const second = useSharedValue(1);
  const third = useSharedValue(1);

  useEffect(() => {
    const dots = [first, second, third];
    dots.forEach((dot, index) => {
      if (reduceMotion) {
        dot.set(1);
        return;
      }
      dot.set(DIM);
      dot.set(
        withDelay(
          index * STAGGER_MS,
          withRepeat(
            withSequence(
              withTiming(1, { duration: PULSE_MS }),
              withTiming(DIM, { duration: PULSE_MS }),
            ),
            -1,
          ),
        ),
      );
    });
  }, [first, second, third, reduceMotion]);

  return (
    <View style={styles.row} accessible={false} importantForAccessibility="no-hide-descendants">
      <Dot opacity={first} />
      <Dot opacity={second} />
      <Dot opacity={third} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 1 },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
});
