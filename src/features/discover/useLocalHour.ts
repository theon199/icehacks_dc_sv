import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** Small slack after the hour turns, so the read never lands a moment before it. */
const AFTER_BOUNDARY_MS = 1000;

/** Milliseconds from `at` until just after the next local hour starts. */
export function msUntilNextHour(at: number): number {
  const next = new Date(at);
  next.setHours(next.getHours() + 1, 0, 0, 0);
  return next.getTime() - at + AFTER_BOUNDARY_MS;
}

/**
 * The local hour (0–23), kept current while the screen stays mounted: re-read when each hour
 * turns and whenever the app returns to the foreground (timers do not run in the background).
 * It only re-renders when the hour actually changes.
 */
export function useLocalHour(clock: () => number = Date.now): number {
  const [hour, setHour] = useState(() => new Date(clock()).getHours());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      const now = clock();
      setHour(new Date(now).getHours());
      timer = setTimeout(refresh, msUntilNextHour(now));
    };
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [clock]);

  return hour;
}
