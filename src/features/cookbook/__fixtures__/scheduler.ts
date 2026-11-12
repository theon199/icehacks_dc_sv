import type { ChunkScheduler } from '../model/runChunked';

/** A scheduler the test advances by hand, one slice per `tick`. */
export function manualScheduler() {
  const queue: (() => void)[] = [];
  const scheduler: ChunkScheduler = {
    schedule: (run) => {
      queue.push(run);
      return run;
    },
    cancel: (handle) => {
      const i = queue.indexOf(handle as () => void);
      if (i >= 0) queue.splice(i, 1);
    },
  };
  return {
    scheduler,
    pending: () => queue.length,
    tick: () => queue.shift()?.(),
  };
}
