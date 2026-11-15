/**
 * The two clocks the sweep screen shows: the recording time on the camera, and which items are
 * still new enough to wear their "New" tag. Each re-renders only when what it shows changes.
 */
import { useEffect, useState } from 'react';

import { formatElapsed } from '../logic/sweep';
import { freshKeys, nextFreshExpiry, type SweepItem } from '../logic/sweepItems';

/** "0:09" of filming so far, ticking once a second while filming. */
export function useFilmingTime(filmedMs: number, filmingSince: number | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (filmingSince == null) return undefined;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [filmingSince]);
  const running = filmingSince == null ? 0 : Math.max(0, now - filmingSince);
  return formatElapsed(filmedMs + running);
}

/** Keys of the items found in the last moment, updated as each tag comes off. */
export function useFreshKeys(items: readonly SweepItem[]): ReadonlySet<string> {
  // `now` only moves when a tag is due to come off. An item found after it has a later
  // `foundAt`, so it counts as fresh straight away.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const wait = nextFreshExpiry(items, Date.now());
    if (wait == null) return undefined;
    const timer = setTimeout(() => setNow(Date.now()), wait);
    return () => clearTimeout(timer);
  }, [items, now]);
  return freshKeys(items, now);
}
