import type { ChunkScheduler } from '../model/runChunked';

type Slice = () => void;

/** A scheduler the test advances by hand, one slice per `tick`. */
export function manualScheduler() {
  const queue: Slice[] = [];
  const scheduler: ChunkScheduler<Slice> = {
    schedule: (run) => {
      queue.push(run);
      return run;
    },
    cancel: (handle) => {
      const at = queue.indexOf(handle);
      if (at >= 0) queue.splice(at, 1);
    },
  };
  return {
    scheduler,
    pending: () => queue.length,
    tick: () => queue.shift()?.(),
  };
}
