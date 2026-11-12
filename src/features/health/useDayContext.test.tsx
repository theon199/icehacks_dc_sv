import { act, renderHook } from '@testing-library/react-native';

import { DAY_MS, HOUR_MS, computeDayContext } from '@/domain/health';

import { useHealthStore } from './healthStore';
import { refreshHealth } from './refresh';
import { useDayContext } from './useDayContext';

jest.mock('./refresh', () => ({ refreshHealth: jest.fn(async () => 'refreshed') }));
jest.mock('./healthKit', () => ({ healthKitSource: {} }));

const NOW = Date.UTC(2026, 10, 11, 12, 0);
const run = { kind: 'running' as const, start: NOW - 2 * HOUR_MS, end: NOW - HOUR_MS };

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  useHealthStore.getState().reset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useDayContext', () => {
  it('returns no context and neutral hints while Health is off', async () => {
    const { result } = await renderHook(() => useDayContext());
    expect(result.current).toEqual({ context: null, hints: { protein: 0, lighter: 0 } });
    expect(refreshHealth).not.toHaveBeenCalled();
  });

  it('returns the stored context and protein hints after an active day', async () => {
    const context = computeDayContext({ workouts: [run], sleep: [], now: NOW });
    useHealthStore.getState().setEnabled(true);
    useHealthStore.getState().applyRefresh({ at: NOW, dayContext: context });
    const { result } = await renderHook(() => useDayContext());
    expect(result.current.context).toEqual(context);
    expect(result.current.hints).toEqual({ protein: 1, lighter: 0 });
    expect(refreshHealth).toHaveBeenCalled();
  });

  it('shows a context computed after the hook mounted', async () => {
    useHealthStore.getState().setEnabled(true);
    const { result } = await renderHook(() => useDayContext());
    expect(result.current.context).toBeNull();

    const later = NOW + 5 * 60_000;
    jest.setSystemTime(later);
    const context = computeDayContext({ workouts: [run], sleep: [], now: later });
    await act(async () => {
      useHealthStore.getState().applyRefresh({ at: later, dayContext: context });
    });
    expect(result.current.context).toEqual(context);
    expect(result.current.hints).toEqual({ protein: 1, lighter: 0 });
  });

  it('drops the context once it expires', async () => {
    const context = computeDayContext({ workouts: [run], sleep: [], now: NOW });
    useHealthStore.getState().setEnabled(true);
    useHealthStore.getState().applyRefresh({ at: NOW, dayContext: context });
    const { result } = await renderHook(() => useDayContext());
    expect(result.current.context).not.toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(DAY_MS + 1);
    });
    expect(result.current.context).toBeNull();
    expect(result.current.hints).toEqual({ protein: 0, lighter: 0 });
  });
});
