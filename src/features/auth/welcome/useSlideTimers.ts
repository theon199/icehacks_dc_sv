import { useCallback, useEffect, useMemo, useRef } from 'react';

export interface SlideTimers {
  /** Run once after `ms`, unless the slide goes idle first. */
  later: (callback: () => void, ms: number) => void;
  /** Run every `ms` until the slide goes idle. */
  every: (callback: () => void, ms: number) => void;
  /** Cancel everything scheduled so far. */
  clear: () => void;
}

/**
 * Timers for one slide's choreography. Everything scheduled is cancelled the moment `running`
 * turns false (slide left, sheet opened, Reduce Motion on) and on unmount, so an idle slide never
 * keeps a timer alive.
 */
export function useSlideTimers(running: boolean): SlideTimers {
  const timeouts = useRef(new Set<ReturnType<typeof setTimeout>>());
  const intervals = useRef(new Set<ReturnType<typeof setInterval>>());

  const clear = useCallback(() => {
    timeouts.current.forEach(clearTimeout);
    intervals.current.forEach(clearInterval);
    timeouts.current.clear();
    intervals.current.clear();
  }, []);

  useEffect(() => {
    if (!running) clear();
    return clear;
  }, [clear, running]);

  const later = useCallback((callback: () => void, ms: number) => {
    const handle = setTimeout(() => {
      timeouts.current.delete(handle);
      callback();
    }, ms);
    timeouts.current.add(handle);
  }, []);

  const every = useCallback((callback: () => void, ms: number) => {
    intervals.current.add(setInterval(callback, ms));
  }, []);

  return useMemo(() => ({ later, every, clear }), [clear, every, later]);
}
