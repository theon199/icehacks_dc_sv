import { act, renderHook } from '@testing-library/react-native';
import type { AppStateStatus } from 'react-native';

import { useCookTimers, type AppStateSource } from './useCookTimers';
import { stepTimerId } from '../logic/timers';
import type { NotificationPermission, TimerNotifier } from '../services/timerNotifier';

jest.mock('expo-notifications', () => ({}));

function fakeAppState(initial: AppStateStatus = 'active') {
  let status = initial;
  const listeners = new Set<(next: AppStateStatus) => void>();
  const source: AppStateSource = {
    current: () => status,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    source,
    set(next: AppStateStatus) {
      status = next;
      listeners.forEach((listener) => listener(next));
    },
  };
}

function fakeNotifier(initial: NotificationPermission = 'undetermined') {
  let permission = initial;
  let next = 0;
  const notifier = {
    permission: jest.fn(async () => permission),
    requestPermission: jest.fn(async () => {
      permission = 'granted';
      return permission;
    }),
    schedule: jest.fn(async () => `notification-${(next += 1)}`),
    cancel: jest.fn(async () => undefined),
  } satisfies TimerNotifier;
  return notifier;
}

const stepTimer = (index: number, seconds: number) => ({
  id: stepTimerId(index),
  label: `Step ${index + 1}`,
  stepIndex: index,
  durationMs: seconds * 1000,
});

/** Lets pending promise callbacks run under fake timers. */
const flush = () => act(async () => {});

/** Runs a state change inside act and lets its promise callbacks settle. */
const run = (change: () => void) =>
  act(async () => {
    change();
  });

async function setup(
  options: { permission?: NotificationPermission; notificationsEnabled?: boolean } = {},
) {
  const appState = fakeAppState();
  const notifier = fakeNotifier(options.permission);
  const onFinish = jest.fn();
  const hook = await renderHook(() =>
    useCookTimers({
      recipeId: 'mealdb:1',
      recipeTitle: 'Lentil soup',
      notificationsEnabled: options.notificationsEnabled ?? true,
      onFinish,
      notifier,
      appState: appState.source,
    }),
  );
  return { ...hook, appState, notifier, onFinish };
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 10, 11, 18, 0) });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useCookTimers', () => {
  it('runs several timers at once and reports each as it finishes', async () => {
    const { result, onFinish } = await setup({ permission: 'granted' });

    await run(() => result.current.start(stepTimer(0, 90)));
    await run(() => jest.advanceTimersByTime(10_000));
    await run(() => result.current.start(stepTimer(3, 30)));
    await flush();

    expect(result.current.timers.map((timer) => timer.id)).toEqual(['step-3', 'step-0']);

    await run(() => jest.advanceTimersByTime(30_000));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'step-3', status: 'done' }),
      false,
    );
    expect(result.current.byId['step-3']?.status).toBe('done');
    expect(result.current.byId['step-0']?.status).toBe('running');

    await run(() => jest.advanceTimersByTime(50_000));
    expect(onFinish).toHaveBeenCalledTimes(2);
    expect(onFinish).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'step-0' }), false);

    // Reported once each, however long the screen stays open.
    await run(() => jest.advanceTimersByTime(10_000));
    expect(onFinish).toHaveBeenCalledTimes(2);
  });

  it('pauses, resumes, extends and removes a timer', async () => {
    const { result } = await setup({ permission: 'granted' });
    await run(() => result.current.start(stepTimer(1, 60)));
    await run(() => jest.advanceTimersByTime(20_000));
    await run(() => result.current.pause('step-1'));
    await run(() => jest.advanceTimersByTime(60_000));
    expect(result.current.byId['step-1']).toMatchObject({ status: 'paused', remainingMs: 40_000 });

    await run(() => result.current.resume('step-1'));
    await run(() => result.current.extend('step-1', 60_000));
    await run(() => jest.advanceTimersByTime(99_000));
    expect(result.current.byId['step-1']?.status).toBe('running');

    await run(() => result.current.remove('step-1'));
    expect(result.current.timers).toEqual([]);
  });

  it('asks for notification permission the first time a timer starts, once', async () => {
    const { result, notifier } = await setup();
    expect(notifier.requestPermission).not.toHaveBeenCalled();

    await run(() => result.current.start(stepTimer(0, 60)));
    await flush();
    await run(() => result.current.start(stepTimer(1, 60)));
    await flush();

    expect(notifier.requestPermission).toHaveBeenCalledTimes(1);
    expect(result.current.permission).toBe('granted');
  });

  it('never asks when cook-timer notifications are turned off', async () => {
    const { result, notifier, appState } = await setup({ notificationsEnabled: false });
    await run(() => result.current.start(stepTimer(0, 60)));
    await run(() => appState.set('background'));
    await flush();
    expect(notifier.requestPermission).not.toHaveBeenCalled();
    expect(notifier.schedule).not.toHaveBeenCalled();
  });

  it('schedules a notification per running timer in the background and cancels them on return', async () => {
    const { result, notifier, appState, onFinish } = await setup({ permission: 'granted' });
    await run(() => result.current.start(stepTimer(0, 120)));
    await run(() => result.current.start(stepTimer(2, 300)));
    await run(() => result.current.start(stepTimer(4, 600)));
    await run(() => result.current.pause('step-4'));
    await run(() => jest.advanceTimersByTime(20_000));

    await run(() => appState.set('background'));
    await flush();

    expect(notifier.schedule).toHaveBeenCalledTimes(2);
    expect(notifier.schedule).toHaveBeenCalledWith({
      title: 'Step 1 timer is done',
      body: 'Lentil soup: time to check on it.',
      seconds: 100,
      url: '/cook/mealdb%3A1',
    });
    expect(notifier.schedule).toHaveBeenCalledWith(expect.objectContaining({ seconds: 280 }));

    // While away, the first timer runs out: no in-app tick reports it.
    await run(() => jest.advanceTimersByTime(150_000));
    expect(onFinish).not.toHaveBeenCalled();

    await run(() => appState.set('active'));
    await flush();

    expect(notifier.cancel).toHaveBeenCalledTimes(2);
    expect(notifier.cancel).toHaveBeenCalledWith('notification-1');
    expect(notifier.cancel).toHaveBeenCalledWith('notification-2');
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ id: 'step-0' }), true);
    expect(result.current.byId['step-0']?.status).toBe('done');
    expect(result.current.byId['step-2']?.status).toBe('running');
  });

  it('cancels a notification whose scheduling was still in flight when Famara came back', async () => {
    const { result, notifier, appState } = await setup({ permission: 'granted' });
    await run(() => result.current.start(stepTimer(0, 60)));
    await run(() => {
      appState.set('background');
      appState.set('active');
    });
    await flush();
    expect(notifier.schedule).toHaveBeenCalledTimes(1);
    expect(notifier.cancel).toHaveBeenCalledWith('notification-1');
  });

  it('does not schedule anything when permission was denied', async () => {
    const { result, notifier, appState } = await setup({ permission: 'denied' });
    await run(() => result.current.start(stepTimer(0, 60)));
    await flush();
    expect(result.current.permission).toBe('denied');
    await run(() => appState.set('background'));
    await flush();
    expect(notifier.schedule).not.toHaveBeenCalled();
  });

  it('cancels scheduled notifications when cook mode closes', async () => {
    const { result, notifier, appState, unmount } = await setup({ permission: 'granted' });
    await run(() => result.current.start(stepTimer(0, 60)));
    await run(() => appState.set('background'));
    await flush();
    await unmount();
    await flush();
    expect(notifier.cancel).toHaveBeenCalledWith('notification-1');
  });

  it('asks the screen to alert when a timer ended away with no notification scheduled', async () => {
    const { result, notifier, appState, onFinish } = await setup({ permission: 'denied' });
    await run(() => result.current.start(stepTimer(0, 30)));
    await run(() => appState.set('background'));
    await flush();
    await run(() => jest.advanceTimersByTime(60_000));
    await run(() => appState.set('active'));
    await flush();

    expect(notifier.schedule).not.toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ id: 'step-0' }), false);
  });

  it('treats a timer as unannounced when cook-timer notifications are off', async () => {
    const { result, appState, onFinish } = await setup({
      permission: 'granted',
      notificationsEnabled: false,
    });
    await run(() => result.current.start(stepTimer(0, 30)));
    await run(() => appState.set('background'));
    await run(() => jest.advanceTimersByTime(60_000));
    await run(() => appState.set('active'));
    await flush();
    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ id: 'step-0' }), false);
  });

  it('says whether a timer actually started', async () => {
    const { result } = await setup({ permission: 'granted' });
    let first = false;
    let repeat = true;
    await run(() => {
      first = result.current.start(stepTimer(0, 60));
    });
    await run(() => {
      repeat = result.current.start(stepTimer(0, 60));
    });
    expect(first).toBe(true);
    expect(repeat).toBe(false);
  });
});
