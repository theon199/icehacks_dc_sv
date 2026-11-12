/**
 * Runs a step generator a slice at a time so long pure computations (the nutrition planner) never
 * hold the JS thread for more than one frame's budget. Each slice keeps pulling steps until the
 * budget is spent, then reports the latest progress and yields to the next frame.
 */

/** Queues one slice of work; `H` is whatever the scheduler needs to call it off again. */
export interface ChunkScheduler<H> {
  schedule: (run: () => void) => H;
  cancel: (handle: H) => void;
}

export type FrameHandle =
  | { readonly kind: 'frame'; readonly id: number }
  | { readonly kind: 'timeout'; readonly id: ReturnType<typeof setTimeout> };

/** Next animation frame when available, otherwise a macrotask. */
export const frameScheduler: ChunkScheduler<FrameHandle> = {
  schedule: (run) =>
    typeof requestAnimationFrame === 'function'
      ? { kind: 'frame', id: requestAnimationFrame(() => run()) }
      : { kind: 'timeout', id: setTimeout(run, 0) },
  cancel: (handle) => {
    if (handle.kind === 'timeout') clearTimeout(handle.id);
    else if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle.id);
  },
};

export interface RunChunkedOptions<P, H> {
  onProgress?: (progress: P) => void;
  /** Milliseconds of work per slice. Default 8, half a 60 Hz frame. */
  budgetMs?: number;
  scheduler: ChunkScheduler<H>;
  now?: () => number;
}

export interface ChunkedRun<R> {
  /** Resolves with the generator's result, or `null` when cancelled first. */
  readonly done: Promise<R | null>;
  cancel: () => void;
}

export function runChunked<P, R, H>(
  steps: Generator<P, R, void>,
  { onProgress, budgetMs = 8, scheduler, now = () => Date.now() }: RunChunkedOptions<P, H>,
): ChunkedRun<R> {
  // Read through the iterator interface, whose `return` takes no value, to close it on cancel.
  const iterator: Iterator<P, R, void> = steps;
  let cancelled = false;
  let pending: { handle: H } | null = null;
  let settle: (value: R | null) => void = () => undefined;
  let fail: (error: unknown) => void = () => undefined;
  const done = new Promise<R | null>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });

  const slice = () => {
    pending = null;
    if (cancelled) return;
    const start = now();
    let latest: P | undefined;
    try {
      for (;;) {
        const step = iterator.next();
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
    pending = { handle: scheduler.schedule(slice) };
  };

  pending = { handle: scheduler.schedule(slice) };

  return {
    done,
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      if (pending) scheduler.cancel(pending.handle);
      pending = null;
      iterator.return?.();
      settle(null);
    },
  };
}
