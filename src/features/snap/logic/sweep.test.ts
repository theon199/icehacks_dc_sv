import {
  addFrame,
  cleanWords,
  emptyFrames,
  failedBatchOutcome,
  flushFrames,
  formatElapsed,
  framesLeft,
  nextFrameDelay,
  SWEEP_FRAME_INTERVAL_MS,
  SWEEP_MAX_BATCHES,
  wordsLeft,
  type SweepFrames,
} from './sweep';

/** Adds `count` stills and returns the batches that went out, plus the final state. */
function film(start: SweepFrames<number>, count: number, from = 0) {
  let frames = start;
  const batches: (readonly number[])[] = [];
  for (let i = 0; i < count; i += 1) {
    const step = addFrame(frames, from + i);
    frames = step.frames;
    if (step.batch) batches.push(step.batch);
  }
  return { frames, batches };
}

describe('sweep batching', () => {
  it('sends stills three at a time and stops at twelve', () => {
    expect(SWEEP_MAX_BATCHES).toBe(4);
    const { frames, batches } = film(emptyFrames(), 14);
    expect(batches).toEqual([
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [9, 10, 11],
    ]);
    expect(frames.taken).toBe(12);
    expect(framesLeft(frames)).toBe(0);
  });

  it('holds a part-filled batch until it is full or flushed', () => {
    const first = film(emptyFrames(), 2);
    expect(first.batches).toEqual([]);
    expect(framesLeft(first.frames)).toBe(10);
    const flushed = flushFrames(first.frames);
    expect(flushed.batch).toEqual([0, 1]);
    expect(flushed.frames.buffer).toEqual([]);
    expect(flushFrames(flushed.frames).batch).toBeNull();
  });

  it('counts a short batch against the four the server allows', () => {
    // Stop after two stills, three times: each stop sends a short batch.
    let frames = emptyFrames<number>();
    for (let stop = 0; stop < 3; stop += 1) {
      frames = flushFrames(film(frames, 2).frames).frames;
    }
    expect(frames.batches).toBe(3);
    expect(frames.taken).toBe(6);
    // One batch is left, so only three more stills fit, and they go out as soon as it is full.
    expect(framesLeft(frames)).toBe(3);
    const last = film(frames, 5, 100);
    expect(last.batches).toEqual([[100, 101, 102]]);
    expect(last.frames.batches).toBe(4);
    expect(framesLeft(last.frames)).toBe(0);
  });

  it('ends the pass when its batches run out, even with frames to spare', () => {
    // One still and a stop, then nine more: 1 + 3 + 3 + 3 uses all four batches at ten stills.
    let frames = film(emptyFrames<number>(), 1).frames;
    frames = flushFrames(frames).frames;
    frames = film(frames, 9, 10).frames;
    expect(frames.taken).toBe(10);
    expect(frames.batches).toBe(4);
    expect(framesLeft(frames)).toBe(0);
    expect(addFrame(frames, 99).batch).toBeNull();
  });
});

describe('sweep timing', () => {
  it('waits out the interval from when the last still started', () => {
    expect(SWEEP_FRAME_INTERVAL_MS).toBe(1500);
    expect(nextFrameDelay(1000, 1200)).toBe(1300);
    expect(nextFrameDelay(1000, 2500)).toBe(0);
    expect(nextFrameDelay(1000, 9000)).toBe(0);
  });

  it('formats filming time like a recorder', () => {
    expect(formatElapsed(9_400)).toBe('0:09');
    expect(formatElapsed(65_000)).toBe('1:05');
    expect(formatElapsed(-5)).toBe('0:00');
  });
});

describe('sweep words', () => {
  it('allows two calls of words per pass', () => {
    expect(wordsLeft(0)).toBe(2);
    expect(wordsLeft(2)).toBe(0);
    expect(wordsLeft(5)).toBe(0);
  });

  it('sends words on one line within the limit, and nothing for silence', () => {
    expect(cleanWords('  paneer in the\nfreezer  ')).toBe('paneer in the freezer');
    expect(cleanWords('   ')).toBeNull();
    expect(cleanWords('a'.repeat(700))).toHaveLength(600);
  });
});

describe('failed batches', () => {
  const nothing = { answered: 0, failuresInARow: 1, items: 0 };

  it('ends a pass that cannot find anything', () => {
    expect(failedBatchOutcome(nothing, true)).toBe('end');
    expect(failedBatchOutcome({ ...nothing, failuresInARow: 2 }, false)).toBe('end');
  });

  it('keeps going after one early failure that more frames might fix', () => {
    expect(failedBatchOutcome(nothing, false)).toBe('continue');
  });

  it('never ends a pass that already found something', () => {
    expect(failedBatchOutcome({ answered: 1, failuresInARow: 3, items: 0 }, true)).toBe('continue');
    expect(failedBatchOutcome({ answered: 0, failuresInARow: 3, items: 2 }, true)).toBe('continue');
  });
});
