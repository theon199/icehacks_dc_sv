import { useState } from 'react';

/**
 * A counter that moves each time `value` is a different object from the previous render. Store
 * selectors return the same object until their slice changes, so the counter is a cheap stand-in
 * for "did this input change" in cache keys.
 */
export function useIdentityVersion(value: unknown): number {
  const [seen, setSeen] = useState({ value, version: 0 });
  if (seen.value !== value) {
    const next = { value, version: seen.version + 1 };
    setSeen(next);
    return next.version;
  }
  return seen.version;
}
