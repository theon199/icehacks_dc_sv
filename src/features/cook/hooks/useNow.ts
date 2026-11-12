/**
 * A shared one-second clock for countdown text. Components that show a running timer read it; one
 * interval serves all of them and stops as soon as nobody is counting down, so nothing else in cook
 * mode re-renders while a timer runs.
 */
import { useSyncExternalStore } from 'react';

const TICK_MS = 1000;

let latest = Date.now();
let interval: ReturnType<typeof setInterval> | null = null;
const readers = new Set<() => void>();

function tick() {
  latest = Date.now();
  for (const reader of readers) reader();
}

function follow(reader: () => void): () => void {
  readers.add(reader);
  if (interval === null) {
    latest = Date.now();
    interval = setInterval(tick, TICK_MS);
  }
  return () => {
    readers.delete(reader);
    if (readers.size === 0 && interval !== null) {
      clearInterval(interval);
      interval = null;
    }
  };
}

const stayStill = () => () => undefined;

/** The value is refreshed when it is a tick or more behind, so a first render is never stale. */
function snapshot(): number {
  const actual = Date.now();
  if (actual - latest >= TICK_MS) latest = actual;
  return latest;
}

/** Epoch ms, updated every second while `ticking` is true and frozen otherwise. */
export function useNow(ticking: boolean): number {
  return useSyncExternalStore(ticking ? follow : stayStill, snapshot, snapshot);
}
