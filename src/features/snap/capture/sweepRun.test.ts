import type { SnapInput, SnapResponse } from '@/lib/api/ai';
import { ApiError } from '@/lib/api/errors';

import { FRAMES_MISSED, startSweepRun, WORDS_NO_FOOD, type SweepView } from './sweepRun';
import { SWEEP_FRAME_INTERVAL_MS } from '../logic/sweep';
import type { SweepSnapResult } from '../snapSession';

const quota = (remaining: number) => ({ remaining, reset_at: '2026-11-15T00:00:00Z' });

const found = (names: string[], remaining = 3): SnapResponse => ({
  status: 'ok',
  mode: 'pantry',
  items: names.map((name) => ({ name, quantity: null, unit: null, confidence: 0.9 })),
  quota: quota(remaining),
});

const noFood: SnapResponse = {
  status: 'no_food',
  mode: 'pantry',
  reason: 'unclear',
  message: 'Hard to read',
  quota: quota(3),
};

const offline = () => new ApiError({ kind: 'network', functionName: 'snap' });
const dailyLimit = () =>
  new ApiError({
    kind: 'rate_limited',
    functionName: 'snap',
    status: 429,
    code: 'quota_exceeded',
    retryAfterSeconds: 3600,
  });

interface Harness {
  calls: SnapInput[];
  views: SweepView[];
  finished: SweepSnapResult[];
  ended: string[];
  paused: string[];
  run: ReturnType<typeof startSweepRun>;
}

/**
 * A run against a fake camera (every still is "frame-N") and a fake AI that answers each call
 * with the next of `answers`, in the order the calls are made.
 */
type Answer = (input: SnapInput) => SnapResponse | Error | Promise<SnapResponse>;

function harness(answers: Answer[]): Harness {
  let frame = 0;
  const calls: SnapInput[] = [];
  const views: SweepView[] = [];
  const finished: SweepSnapResult[] = [];
  const ended: string[] = [];
  const paused: string[] = [];
  const run = startSweepRun({
    id: '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b',
    deps: {
      prepare: async (source) => ({ ...source, base64: source.uri }),
      readSnap: async (input) => {
        calls.push(input);
        const answer = (await answers.shift()?.(input)) ?? new Error('unexpected call');
        if (answer instanceof Error) throw answer;
        return answer;
      },
      now: () => Date.now(),
    },
    capture: async () => {
      frame += 1;
      return { uri: `frame-${frame}`, width: 10, height: 10 };
    },
    onChange: (view) => views.push(view),
    onFinish: (result) => finished.push(result),
    onEnd: (problem) => ended.push(problem.title),
    onPause: (problem) => paused.push(problem.pause?.note ?? ''),
  });
  return { calls, views, finished, ended, paused, run };
}

/** Lets the next still be taken and every pending promise settle. */
async function advance(ms = SWEEP_FRAME_INTERVAL_MS) {
  await jest.advanceTimersByTimeAsync(ms);
}

const sentImages = (calls: SnapInput[]) =>
  calls.map((call) => ('images' in call ? call.images : null));

beforeEach(() => jest.useFakeTimers({ now: new Date('2026-11-14T12:00:00Z') }));
afterEach(() => jest.useRealTimers());

describe('a fridge sweep', () => {
  it('films twelve stills in four batches of one pass, then stops by itself', async () => {
    const answers = Array.from(
      { length: 4 },
      (_, i) => () => found([`food${i}`], i === 0 ? 19 : 3),
    );
    const h = harness(answers);
    await advance(0);
    expect(h.run.view.status).toBe('filming');
    await advance(SWEEP_FRAME_INTERVAL_MS * 12);

    expect(sentImages(h.calls)).toEqual([
      ['frame-1', 'frame-2', 'frame-3'],
      ['frame-4', 'frame-5', 'frame-6'],
      ['frame-7', 'frame-8', 'frame-9'],
      ['frame-10', 'frame-11', 'frame-12'],
    ]);
    const ids = new Set(h.calls.map((call) => ('sweep_id' in call ? call.sweep_id : null)));
    expect([...ids]).toEqual(['3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b']);
    expect(h.run.view).toMatchObject({ status: 'paused', framesLeft: 0, answered: 4, sawFood: 4 });
    expect(h.run.view.items.map((item) => item.name)).toEqual(['Food3', 'Food2', 'Food1', 'Food0']);

    h.run.finish();
    expect(h.finished).toHaveLength(1);
    // The daily allowance comes from the first batch, the one that paid for the pass.
    expect(h.finished[0]).toMatchObject({ mode: 'sweep', remaining: 19 });
    expect(h.finished[0]?.items).toHaveLength(4);
  });

  it('sends a short batch when stopped, and waits for it before finishing', async () => {
    let answer: (value: SnapResponse) => void = () => {};
    const held = new Promise<SnapResponse>((resolve) => {
      answer = resolve;
    });
    const h = harness([() => held]);
    await advance(0);
    await advance();
    h.run.stop();
    expect(sentImages(h.calls)).toEqual([['frame-1', 'frame-2']]);
    expect(h.run.view).toMatchObject({ status: 'paused', reading: 1 });

    h.run.finish();
    expect(h.run.view.status).toBe('finishing');
    expect(h.finished).toHaveLength(0);
    answer(found(['milk']));
    await advance(0);
    expect(h.finished).toHaveLength(1);
    expect(h.finished[0]?.items.map((item) => item.name)).toEqual(['Milk']);
  });

  it('keeps what other batches found when one fails', async () => {
    const h = harness([() => found(['milk']), () => offline(), () => found(['eggs'])]);
    await advance(0);
    await advance(SWEEP_FRAME_INTERVAL_MS * 9);
    expect(h.calls).toHaveLength(3);
    expect(h.ended).toEqual([]);
    expect(h.run.view.notice).toBe(FRAMES_MISSED);
    expect(h.run.view.items.map((item) => item.name)).toEqual(['Eggs', 'Milk']);
    expect(h.run.view.status).toBe('filming');
  });

  it('ends the pass at the daily limit when nothing was found yet', async () => {
    const h = harness([() => dailyLimit()]);
    await advance(0);
    await advance(SWEEP_FRAME_INTERVAL_MS * 3);
    expect(h.ended).toEqual(["You've reached today's Snap limit"]);
    expect(h.paused).toHaveLength(1);
    const callsAtEnd = h.calls.length;
    await advance(SWEEP_FRAME_INTERVAL_MS * 6);
    expect(h.calls).toHaveLength(callsAtEnd);
  });

  it('gives up when the first two batches both fail', async () => {
    const h = harness([() => offline(), () => offline()]);
    await advance(0);
    await advance(SWEEP_FRAME_INTERVAL_MS * 3);
    expect(h.ended).toEqual([]);
    await advance(SWEEP_FRAME_INTERVAL_MS * 3);
    expect(h.ended).toEqual(["You're offline"]);
  });

  it('notes when the frames show no food', async () => {
    const h = harness([() => noFood]);
    await advance(0);
    await advance(SWEEP_FRAME_INTERVAL_MS * 2);
    h.run.stop();
    await advance(0);
    expect(h.run.view).toMatchObject({ answered: 1, sawFood: 0, items: [] });
  });

  it('reads words into the same list, twice per pass', async () => {
    const h = harness([
      () => noFood,
      () => found(['paneer']),
      () => ({ ...noFood, reason: 'not_food' as const }),
    ]);
    await advance(0);
    // The one still taken so far goes out as its own batch.
    h.run.stop();
    expect(h.run.sendWords('paneer in the freezer')).toBe(true);
    await advance(0);
    expect(h.calls[1]).toEqual({
      mode: 'pantry',
      sweep_id: '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b',
      text: 'paneer in the freezer',
    });
    expect(h.run.view.items[0]).toMatchObject({ name: 'Paneer', origin: 'said' });
    expect(h.run.view.wordsLeft).toBe(1);

    expect(h.run.sendWords('   ')).toBe(false);
    expect(h.run.sendWords('a chair')).toBe(true);
    await advance(0);
    expect(h.run.view.notice).toBe(WORDS_NO_FOOD);
    expect(h.run.sendWords('two lemons')).toBe(false);
    expect(h.calls).toHaveLength(3);
  });

  it('films more after a stop until the pass is used up', async () => {
    const h = harness(Array.from({ length: 4 }, () => () => found(['milk'])));
    await advance(0);
    await advance(SWEEP_FRAME_INTERVAL_MS * 2);
    h.run.stop();
    const left = h.run.view.framesLeft;
    expect(left).toBe(9);
    h.run.filmMore();
    await advance(0);
    expect(h.run.view.status).toBe('filming');
    await advance(SWEEP_FRAME_INTERVAL_MS * 12);
    expect(h.run.view).toMatchObject({ status: 'paused', framesLeft: 0 });
    h.run.filmMore();
    expect(h.run.view.status).toBe('paused');
    expect(h.calls).toHaveLength(4);
  });

  it('stops everything when cancelled', async () => {
    const h = harness([]);
    await advance(0);
    h.run.cancel();
    await advance(SWEEP_FRAME_INTERVAL_MS * 12);
    h.run.finish();
    expect(h.calls).toHaveLength(0);
    expect(h.finished).toHaveLength(0);
  });
});
