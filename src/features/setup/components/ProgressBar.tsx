import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/ui';

export interface ProgressBarProps {
  /** 1-based position. */
  step: number;
  total: number;
}

/** Thin bar across the top of onboarding; announces "Step 3 of 10". */
export function ProgressBar({ step, total }: ProgressBarProps) {
  const theme = useTheme();
  const fraction = total > 0 ? Math.min(1, Math.max(0, step / total)) : 0;
  const duration = theme.motion.duration.base;
  const fill = useAnimatedStyle(() => ({
    transform: [{ scaleX: withTiming(fraction, { duration }) }],
  }));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${total}`}
      accessibilityValue={{ min: 1, max: total, now: step }}
      style={[styles.track, { backgroundColor: theme.colors.surfaceSunken }]}
    >
      <Animated.View style={[styles.fill, { backgroundColor: theme.colors.primary }, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { width: '100%', height: '100%', borderRadius: 3, transformOrigin: 'left' },
});
