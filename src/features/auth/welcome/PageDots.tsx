import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { PressableScale, radii } from '@/ui';

import { night } from '../components/NightTheme';

const DOT = 8;
const ACTIVE_DOT = 30;
const GAP = 7;
const WIDTH_MS = 300;

/**
 * The page indicator: the current page is a long capsule that fills over the page's time; every
 * dot is a button that jumps to its page. Each target is 44 pt tall and spans its share of the
 * row, so the small dots stay easy to hit.
 */
export function PageDots({
  count,
  index,
  progress,
  staticFill,
  onSelect,
}: {
  count: number;
  index: number;
  progress: SharedValue<number>;
  /** Reduce Motion: the current capsule is solid instead of filling. */
  staticFill: boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <View style={styles.row}>
      {Array.from({ length: count }, (_unused, dot) => (
        <Dot
          key={dot}
          index={dot}
          count={count}
          active={dot === index}
          progress={progress}
          staticFill={staticFill}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}

function Dot({
  index,
  count,
  active,
  progress,
  staticFill,
  onSelect,
}: {
  index: number;
  count: number;
  active: boolean;
  progress: SharedValue<number>;
  staticFill: boolean;
  onSelect: (index: number) => void;
}) {
  const width = useSharedValue(active ? ACTIVE_DOT : DOT);
  useEffect(() => {
    const target = active ? ACTIVE_DOT : DOT;
    width.set(
      staticFill
        ? target
        : withTiming(target, { duration: WIDTH_MS, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }),
    );
  }, [active, staticFill, width]);

  const trackStyle = useAnimatedStyle(() => ({ width: width.get() }));
  const fillStyle = useAnimatedStyle(() => ({
    width: `${(staticFill ? 1 : progress.get()) * 100}%`,
  }));

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Show page ${index + 1} of ${count}`}
      accessibilityState={{ selected: active }}
      hitSlop={{ top: 8, bottom: 8, left: GAP / 2, right: GAP / 2 }}
      pressedScale={1}
      onPress={() => onSelect(index)}
      style={styles.hit}
      testID={`welcome-page-${index + 1}`}
    >
      <Animated.View style={[styles.track, active ? styles.trackActive : null, trackStyle]}>
        {active ? <Animated.View style={[styles.fill, fillStyle]} /> : null}
      </Animated.View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: GAP },
  hit: { height: 28, justifyContent: 'center' },
  track: {
    height: DOT,
    borderRadius: radii.pill,
    overflow: 'hidden',
    backgroundColor: night.inkFaint,
  },
  trackActive: { backgroundColor: night.hairline },
  fill: { height: '100%', borderRadius: radii.pill, backgroundColor: night.ink },
});
