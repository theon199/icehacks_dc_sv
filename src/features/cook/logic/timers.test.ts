import {
  MAX_TIMERS,
  dueTimerIds,
  extendTimer,
  finishTimers,
  hasRunningTimers,
  orderTimers,
  pauseTimer,
  remainingMs,
  removeTimer,
  resumeTimer,
  secondsUntilEnd,
  startTimer,
  stepTimerId,
  type TimerMap,
} from './timers';

const T0 = 1_700_000_000_000;
const step = (index: number, seconds: number) => ({
  id: stepTimerId(index),
  label: `Step ${index + 1}`,
  stepIndex: index,
  durationMs: seconds * 1000,
});

describe('cook timers', () => {
  it('runs several timers at once, each finishing on its own schedule', () => {
    let timers: TimerMap = {};
    timers = startTimer(timers, step(0, 60), T0);
    timers = startTimer(timers, step(2, 30), T0 + 5_000);
    expect(hasRunningTimers(timers)).toBe(true);

    expect(dueTimerIds(timers, T0 + 34_999)).toEqual([]);
    timers = finishTimers(timers, T0 + 35_000);
    expect(timers['step-2']?.status).toBe('done');
    expect(timers['step-0']?.status).toBe('running');
    expect(remainingMs(timers['step-0']!, T0 + 35_000)).toBe(25_000);

    timers = finishTimers(timers, T0 + 61_000);
    expect(timers['step-0']?.status).toBe('done');
    expect(hasRunningTimers(timers)).toBe(false);
  });

  it('ignores a second start of a timer that is still going', () => {
    const first = startTimer({}, step(1, 60), T0);
    expect(startTimer(first, step(1, 60), T0 + 10_000)).toBe(first);
  });

  it('restarts a finished timer', () => {
    const done = finishTimers(startTimer({}, step(1, 10), T0), T0 + 10_000);
    const again = startTimer(done, step(1, 10), T0 + 20_000);
    expect(again['step-1']).toMatchObject({ status: 'running', endsAt: T0 + 30_000 });
  });

  it('rejects durations under a second and caps very long ones', () => {
    expect(startTimer({}, step(0, 0), T0)).toEqual({});
    expect(startTimer({}, { ...step(0, 1), durationMs: Number.NaN }, T0)).toEqual({});
    const long = startTimer({}, step(0, 48 * 3600), T0);
    expect(long['step-0']?.durationMs).toBe(12 * 3600 * 1000);
  });

  it(`refuses more than ${MAX_TIMERS} active timers`, () => {
    let timers: TimerMap = {};
    for (let i = 0; i < MAX_TIMERS + 2; i += 1) timers = startTimer(timers, step(i, 60), T0);
    expect(Object.keys(timers)).toHaveLength(MAX_TIMERS);
  });

  it('pauses and resumes without losing time', () => {
    let timers = startTimer({}, step(0, 60), T0);
    timers = pauseTimer(timers, 'step-0', T0 + 20_000);
    expect(timers['step-0']).toMatchObject({ status: 'paused', endsAt: null, remainingMs: 40_000 });
    // Time passing while paused does not count.
    expect(remainingMs(timers['step-0']!, T0 + 500_000)).toBe(40_000);
    expect(finishTimers(timers, T0 + 500_000)).toBe(timers);

    timers = resumeTimer(timers, 'step-0', T0 + 100_000);
    expect(timers['step-0']).toMatchObject({ status: 'running', endsAt: T0 + 140_000 });
  });

  it('finishes instead of pausing a timer that already ran out', () => {
    const timers = pauseTimer(startTimer({}, step(0, 10), T0), 'step-0', T0 + 11_000);
    expect(timers['step-0']?.status).toBe('done');
  });

  it('adds time to running, paused and finished timers', () => {
    const running = extendTimer(startTimer({}, step(0, 60), T0), 'step-0', 60_000, T0 + 30_000);
    expect(remainingMs(running['step-0']!, T0 + 30_000)).toBe(90_000);

    const paused = extendTimer(
      pauseTimer(startTimer({}, step(0, 60), T0), 'step-0', T0 + 30_000),
      'step-0',
      60_000,
      T0 + 40_000,
    );
    expect(paused['step-0']).toMatchObject({ status: 'paused', remainingMs: 90_000 });

    const done = finishTimers(startTimer({}, step(0, 10), T0), T0 + 10_000);
    const extended = extendTimer(done, 'step-0', 60_000, T0 + 15_000);
    expect(extended['step-0']).toMatchObject({ status: 'running', endsAt: T0 + 75_000 });
  });

  it('removes timers and leaves unknown ids alone', () => {
    const timers = startTimer({}, step(0, 60), T0);
    expect(removeTimer(timers, 'step-0')).toEqual({});
    expect(removeTimer(timers, 'nope')).toBe(timers);
    expect(pauseTimer(timers, 'nope', T0)).toBe(timers);
    expect(resumeTimer(timers, 'step-0', T0)).toBe(timers);
  });

  it('orders finished timers first, then the soonest to end, then paused ones', () => {
    let timers: TimerMap = {};
    timers = startTimer(timers, step(0, 300), T0);
    timers = startTimer(timers, step(1, 60), T0);
    timers = startTimer(timers, step(2, 10), T0);
    timers = startTimer(timers, step(3, 600), T0);
    timers = pauseTimer(timers, 'step-3', T0 + 1_000);
    timers = finishTimers(timers, T0 + 10_000);
    expect(orderTimers(timers, T0 + 10_000).map((timer) => timer.id)).toEqual([
      'step-2',
      'step-1',
      'step-0',
      'step-3',
    ]);
  });

  it('rounds the notification delay up to whole seconds', () => {
    const timers = startTimer({}, step(0, 60), T0);
    expect(secondsUntilEnd(timers['step-0']!, T0 + 100)).toBe(60);
    expect(secondsUntilEnd(timers['step-0']!, T0 + 60_000)).toBe(1);
    const paused = pauseTimer(timers, 'step-0', T0);
    expect(secondsUntilEnd(paused['step-0']!, T0)).toBeNull();
  });
});
