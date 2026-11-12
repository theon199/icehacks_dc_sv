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
 * Re-reads the hour now and again just after each hour boundary, plus whenever the app comes
 * back to the foreground (timers are paused while it is in the background). Returns a stop
 * function that cancels the pending wake-up and drops the foreground listener.
 */
function watchHour(clock: () => number, onHour: (hour: number) => void): () => void {
  const wake = { handle: null as ReturnType<typeof setTimeout> | null };

  const cancelWake = () => {
    if (wake.handle !== null) clearTimeout(wake.handle);
    wake.handle = null;
  };

  const tick = () => {
    cancelWake();
    const reading = clock();
    onHour(new Date(reading).getHours());
    wake.handle = setTimeout(tick, msUntilNextHour(reading));
  };

  const foreground = AppState.addEventListener('change', (next) => {
    if (next === 'active') tick();
  });
  tick();

  return () => {
    cancelWake();
    foreground.remove();
  };
}

/**
 * The local hour (0–23), kept current while the screen stays mounted. It only re-renders when
 * the hour actually changes.
 */
export function useLocalHour(clock: () => number = Date.now): number {
  const [hour, setHour] = useState(() => new Date(clock()).getHours());
  useEffect(() => watchHour(clock, setHour), [clock]);
  return hour;
}
