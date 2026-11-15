import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Easing,
  cancelAnimation,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

export interface SlideClock {
  index: number;
  /** Jump to a slide (wrapping) and give it its full time. */
  goTo: (next: number) => void;
  /** 0 to 1 across the current slide's time, for the page indicator's fill. */
  progress: SharedValue<number>;
}

/**
 * The carousel's one clock: a single timeout per slide drives auto-advance and the indicator fill
 * runs on the UI thread from the same remaining time. Pausing keeps the elapsed time, so resuming
 * finishes the slide instead of restarting it.
 */
export function useSlideClock({
  count,
  durationMs,
  running,
}: {
  count: number;
  durationMs: number;
  running: boolean;
}): SlideClock {
  const [index, setIndex] = useState(0);
  const progress = useSharedValue(0);
  const elapsed = useRef(0);
  const clockIndex = useRef(index);

  useEffect(() => {
    if (clockIndex.current !== index) {
      clockIndex.current = index;
      elapsed.current = 0;
      progress.set(0);
    }
    if (!running) return;
    const remaining = Math.max(0, durationMs - elapsed.current);
    const startedAt = Date.now();
    progress.set(withTiming(1, { duration: remaining, easing: Easing.linear }));
    const timer = setTimeout(() => setIndex((current) => (current + 1) % count), remaining);
    return () => {
      clearTimeout(timer);
      cancelAnimation(progress);
      elapsed.current += Date.now() - startedAt;
    };
  }, [count, durationMs, index, progress, running]);

  const goTo = useCallback((next: number) => setIndex(((next % count) + count) % count), [count]);

  return { index, goTo, progress };
}
