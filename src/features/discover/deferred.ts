export interface DeferredTask {
  cancel: () => void;
}

/** Longest a deferred task waits for an idle moment before it runs anyway. */
const IDLE_TIMEOUT_MS = 300;

/**
 * Runs `work` once, in the next idle period, so ranking never competes with a swipe for the JS
 * thread. A plain timer backs the idle callback up: busy screens (a looping skeleton, say) may
 * never look idle, and a deck must still arrive. Cancelling before it starts skips it.
 */
export function runDeferred(work: () => void): DeferredTask {
  let done = false;
  let idle: number | null = null;
  const run = () => {
    if (done) return;
    done = true;
    if (idle !== null) cancelIdleCallback(idle);
    clearTimeout(timer);
    work();
  };
  const timer = setTimeout(run, IDLE_TIMEOUT_MS);
  if (typeof requestIdleCallback === 'function') idle = requestIdleCallback(run);
  return {
    cancel: () => {
      done = true;
      clearTimeout(timer);
      if (idle !== null) cancelIdleCallback(idle);
    },
  };
}
