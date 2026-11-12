import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { msUntilNextHour, useLocalHour } from './useLocalHour';

const at = (hour: number, minute = 0) => new Date(2026, 10, 11, hour, minute).getTime();

describe('msUntilNextHour', () => {
  it('lands just after the next hour starts', () => {
    const now = at(14, 59);
    expect(new Date(now + msUntilNextHour(now)).getHours()).toBe(15);
    expect(msUntilNextHour(now)).toBeLessThanOrEqual(61_000);
  });
});

describe('useLocalHour', () => {
  let listeners: ((state: AppStateStatus) => void)[];

  beforeEach(() => {
    jest.useFakeTimers();
    listeners = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.push(listener as (state: AppStateStatus) => void);
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('moves on when the hour turns while the screen stays open', async () => {
    let now = at(14, 59);
    const clock = () => now;
    const { result } = await renderHook(() => useLocalHour(clock));
    expect(result.current).toBe(14);

    now = at(15, 0) + 1000;
    await act(async () => jest.advanceTimersByTime(msUntilNextHour(at(14, 59))));
    expect(result.current).toBe(15);
  });

  it('re-reads the hour when the app returns to the foreground', async () => {
    let now = at(9, 30);
    const clock = () => now;
    const { result } = await renderHook(() => useLocalHour(clock));
    expect(result.current).toBe(9);

    now = at(18, 5);
    await act(async () => listeners.forEach((listener) => listener('active')));
    expect(result.current).toBe(18);
  });
});
