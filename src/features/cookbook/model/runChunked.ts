/**
 * Runs a step generator a slice at a time so long pure computations (the nutrition planner) never
 * hold the JS thread for more than one frame's budget. Each slice keeps pulling steps until the
 * budget is spent, then reports the latest progress and yields to the next frame.
 */

export interface ChunkScheduler {
  schedule: (run: () => void) => unknown;
  cancel: (handle: unknown) => void;
}

/** Next animation frame when available, otherwise a macrotask. */
export const frameScheduler: ChunkScheduler = {
  schedule: (run) =>
    typeof requestAnimationFrame === 'function'
      ? { raf: requestAnimationFrame(() => run()) }
      : { timeout: setTimeout(run, 0) },
  cancel: (handle) => {
    const h = handle as { raf?: number; timeout?: ReturnType<typeof setTimeout> };
    if (h.raf !== undefined && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(h.raf);
    }
    if (h.timeout !== undefined) clearTimeout(h.timeout);
  },
};

export interface RunChunkedOptions<P> {
  onProgress?: (progress: P) => void;
  /** Milliseconds of work per slice. Default 8, half a 60 Hz frame. */
  budgetMs?: number;
  scheduler?: ChunkScheduler;
  now?: () => number;
}

export interface ChunkedRun<R> {
  /** Resolves with the generator's result, or `null` when cancelled first. */
  readonly done: Promise<R | null>;
  cancel: () => void;
}

export function runChunked<P, R>(
  steps: Generator<P, R, void>,
  {
    onProgress,
    budgetMs = 8,
    scheduler = frameScheduler,
    now = () => Date.now(),
  }: RunChunkedOptions<P> = {},
): ChunkedRun<R> {
  let cancelled = false;
  let handle: unknown = null;
  let settle: (value: R | null) => void = () => undefined;
  let fail: (error: unknown) => void = () => undefined;
  const done = new Promise<R | null>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });

  const slice = () => {
    handle = null;
    if (cancelled) return;
    const start = now();
    let latest: P | undefined;
    try {
      for (;;) {
        const step = steps.next();
        if (step.done) {
          settle(step.value);
          return;
        }
        latest = step.value;
        if (now() - start >= budgetMs) break;
      }
    } catch (error) {
      fail(error);
      return;
    }
    if (latest !== undefined) onProgress?.(latest);
    handle = scheduler.schedule(slice);
  };

  handle = scheduler.schedule(slice);

  return {
    done,
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      if (handle !== null) scheduler.cancel(handle);
      handle = null;
      steps.return(undefined as never);
      settle(null);
    },
  };
}
