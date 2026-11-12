import { runChunked } from './runChunked';
import { manualScheduler } from '../__fixtures__/scheduler';

function* counter(steps: number): Generator<number, string, void> {
  for (let i = 1; i <= steps; i += 1) yield i;
  return 'finished';
}

/** A clock that advances one millisecond per read, so a 3 ms budget allows three steps. */
function steppingClock() {
  let t = 0;
  return () => t++;
}

describe('runChunked', () => {
  it('does no work until the first slice runs', () => {
    const { scheduler, pending } = manualScheduler();
    const onProgress = jest.fn();
    runChunked(counter(5), { scheduler, onProgress });
    expect(onProgress).not.toHaveBeenCalled();
    expect(pending()).toBe(1);
  });

  it('spreads the steps over slices and reports progress after each', async () => {
    const { scheduler, tick } = manualScheduler();
    const progress: number[] = [];
    const run = runChunked(counter(7), {
      scheduler,
      budgetMs: 3,
      now: steppingClock(),
      onProgress: (p) => progress.push(p),
    });
    tick();
    tick();
    tick();
    await expect(run.done).resolves.toBe('finished');
    expect(progress.length).toBeGreaterThanOrEqual(2);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
  });

  it('stops and resolves null when cancelled', async () => {
    const { scheduler, tick, pending } = manualScheduler();
    const onProgress = jest.fn();
    const run = runChunked(counter(100), {
      scheduler,
      budgetMs: 1,
      now: steppingClock(),
      onProgress,
    });
    tick();
    run.cancel();
    expect(pending()).toBe(0);
    await expect(run.done).resolves.toBeNull();
    expect(onProgress).toHaveBeenCalledTimes(1);
  });

  it('rejects when a step throws', async () => {
    const { scheduler, tick } = manualScheduler();
    function* broken(): Generator<number, number, void> {
      yield 1;
      throw new Error('boom');
    }
    const run = runChunked(broken(), { scheduler, budgetMs: 100 });
    tick();
    await expect(run.done).rejects.toThrow('boom');
  });
});
