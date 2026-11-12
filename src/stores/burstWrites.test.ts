import Storage from 'expo-sqlite/kv-store';
import { AppState, type AppStateStatus } from 'react-native';

import { flushPendingWrites, storageKey } from '@/lib/storage/kv';

import { useChefStore } from './chef';
import { useCookLogStore } from './cookLog';
import { useFeedbackStore } from './feedback';
import { BURST_WRITE_WINDOW_MS } from './persistence';

jest.mock('expo-crypto', () => ({
  randomUUID: () => (jest.requireActual('crypto') as { randomUUID: () => string }).randomUUID(),
}));

// Captured before the first deferred write registers its listener.
const appStateListeners: ((state: AppStateStatus) => void)[] = [];
jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
  appStateListeners.push(listener as (state: AppStateStatus) => void);
  return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
});

const FEEDBACK_KEY = storageKey('user.feedback');
// The storage mock's accessors are mock functions; their calls show the disk traffic.
const setItem = jest.mocked(Storage.setItemSync);

const writesOf = (key: string) => setItem.mock.calls.filter(([written]) => written === key).length;
const storedEventCount = () => {
  const raw = Storage.getItemSync(FEEDBACK_KEY);
  if (raw == null) return null;
  return Object.keys((JSON.parse(raw) as { state: { events: object } }).state.events).length;
};
const swipe = (i: number) =>
  useFeedbackStore.getState().record({ recipeId: `r${i}`, kind: i % 2 ? 'like' : 'pass' });

beforeEach(() => {
  jest.useFakeTimers();
  useFeedbackStore.getState().reset();
  flushPendingWrites();
  Storage.clearSync();
  setItem.mockClear();
});

afterEach(() => jest.useRealTimers());

describe('stores written in bursts', () => {
  it('write a feedback burst at most once per window', () => {
    for (let i = 0; i < 40; i += 1) swipe(i);
    expect(writesOf(FEEDBACK_KEY)).toBe(0);

    jest.advanceTimersByTime(BURST_WRITE_WINDOW_MS);
    expect(writesOf(FEEDBACK_KEY)).toBe(1);
    expect(storedEventCount()).toBe(40);

    // A steady stream of swipes across three windows.
    for (let i = 0; i < 30; i += 1) {
      swipe(100 + i);
      jest.advanceTimersByTime(BURST_WRITE_WINDOW_MS / 10);
    }
    jest.advanceTimersByTime(BURST_WRITE_WINDOW_MS);
    expect(writesOf(FEEDBACK_KEY)).toBeLessThanOrEqual(1 + 3);
    expect(storedEventCount()).toBe(70);
  });

  it('are written as soon as the app leaves the foreground', () => {
    swipe(1);
    expect(appStateListeners.length).toBeGreaterThan(0);
    for (const listener of appStateListeners) listener('background');
    expect(writesOf(FEEDBACK_KEY)).toBe(1);
    expect(storedEventCount()).toBe(1);
    // Nothing is left to write when the window would have ended.
    jest.advanceTimersByTime(BURST_WRITE_WINDOW_MS);
    expect(writesOf(FEEDBACK_KEY)).toBe(1);
  });

  it('read back the pending state before it reaches disk', async () => {
    swipe(1);
    swipe(2);
    await useFeedbackStore.persist.rehydrate();
    expect(Object.keys(useFeedbackStore.getState().events)).toHaveLength(2);
  });

  it('are never written after a wipe', () => {
    swipe(1);
    useFeedbackStore.getState().reset();
    useFeedbackStore.persist.clearStorage();
    jest.advanceTimersByTime(BURST_WRITE_WINDOW_MS * 2);
    flushPendingWrites();
    expect(Storage.getItemSync(FEEDBACK_KEY)).toBeNull();
  });

  it('include the chef threads and the cook log', () => {
    const thread = useChefStore.getState().startThread();
    for (let i = 0; i < 5; i += 1) {
      useChefStore.getState().append(thread, { role: 'user', text: `question ${i}` });
    }
    for (let i = 0; i < 5; i += 1) useCookLogStore.getState().log({ recipeId: `r${i}` });
    expect(writesOf(storageKey('user.chef'))).toBe(0);
    expect(writesOf(storageKey('user.cook_log'))).toBe(0);
    flushPendingWrites();
    expect(writesOf(storageKey('user.chef'))).toBe(1);
    expect(writesOf(storageKey('user.cook_log'))).toBe(1);
  });
});
