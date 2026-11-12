import {
  withTiming,
  type ExitAnimationsValues,
  type LayoutAnimation,
  type SharedValue,
} from 'react-native-reanimated';

import { motion } from '@/ui/tokens';

import { tiltFor } from '../swipe';

const EXIT_DURATION = motion.duration.base;

/**
 * Exit animation for a decided card: it leaves from wherever the drag left it, sideways for a
 * like (-1 → left, 1 → right) or fading upwards for a save or "not for me" (0).
 */
export function flyOut(
  x: SharedValue<number>,
  y: SharedValue<number>,
  direction: SharedValue<number>,
  width: number,
) {
  return (values: ExitAnimationsValues): LayoutAnimation => {
    'worklet';
    const dir = direction.get();
    const startX = x.get();
    const startY = y.get();
    const endX = dir === 0 ? startX : dir * values.windowWidth * 1.3;
    const endY = dir === 0 ? startY - values.windowHeight * 0.4 : startY + 40;
    const config = { duration: EXIT_DURATION };
    return {
      initialValues: {
        opacity: 1,
        transform: [
          { translateX: startX },
          { translateY: startY },
          { rotate: `${tiltFor(startX, width)}deg` },
        ],
      },
      animations: {
        opacity: withTiming(dir === 0 ? 0 : 1, config),
        transform: [
          { translateX: withTiming(endX, config) },
          { translateY: withTiming(endY, config) },
          { rotate: withTiming(`${tiltFor(endX, width)}deg`, config) },
        ],
      },
    };
  };
}
