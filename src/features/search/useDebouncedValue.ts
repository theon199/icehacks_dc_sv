import { useEffect, useState } from 'react';

/** How long typing must pause before a search runs. */
export const SEARCH_DEBOUNCE_MS = 150;

/**
 * Returns `value` once it has stopped changing for `delayMs`. An empty string is passed through at
 * once, so clearing the box brings the idle screen back without waiting.
 */
export function useDebouncedValue<T>(value: T, delayMs = SEARCH_DEBOUNCE_MS): T {
  const [settled, setSettled] = useState(value);
  const empty = value === '';
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), empty ? 0 : delayMs);
    return () => clearTimeout(timer);
  }, [value, empty, delayMs]);
  return empty ? value : settled;
}
