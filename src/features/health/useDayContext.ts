import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import {
  isDayContextActive,
  rankingHintsFor,
  type DayContext,
  type DayRankingHints,
} from '@/domain/health';

import { useHealthStore } from './healthStore';
import { useHealthRefresh } from './useHealthRefresh';

export interface DayContextView {
  /** Today's context, or null when Health is off, nothing was read, or it has expired. */
  context: DayContext | null;
  /** How much to lean towards protein-rich or lighter dishes (each 0..1; 0 means as usual). */
  hints: DayRankingHints;
}

/**
 * Today's day context for ranking suggestions. Re-renders when the context expires and when the
 * app returns to the foreground, so an expired context never lingers.
 */
export function useDayContext(): DayContextView {
  useHealthRefresh();
  const enabled = useHealthStore((state) => state.enabled);
  const stored = useHealthStore((state) => state.dayContext);
  const [now, setNow] = useState(() => Date.now());

  // A context that arrives while mounted was computed after `now` was last read; move the clock up
  // to the present so it is not mistaken for one from the future.
  useEffect(
    () =>
      useHealthStore.subscribe((state, previous) => {
        if (state.dayContext !== previous.dayContext) setNow(Date.now());
      }),
    [],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') setNow(Date.now());
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!stored || !isDayContextActive(stored, Date.now())) return;
    const timer = setTimeout(() => setNow(Date.now()), stored.expiresAt - Date.now() + 1);
    return () => clearTimeout(timer);
  }, [stored]);

  return useMemo(() => {
    const context = enabled && stored && isDayContextActive(stored, now) ? stored : null;
    return { context, hints: rankingHintsFor(context, now) };
  }, [enabled, stored, now]);
}
