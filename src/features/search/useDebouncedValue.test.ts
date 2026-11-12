import { act, renderHook } from '@testing-library/react-native';

import { SEARCH_DEBOUNCE_MS, useDebouncedValue } from './useDebouncedValue';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('useDebouncedValue', () => {
  it('waits 150 ms after the last change', async () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(150);
    const { result, rerender } = await renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value),
      {
        initialProps: { value: '' },
      },
    );
    await rerender({ value: 'l' });
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    await rerender({ value: 'le' });
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    await rerender({ value: 'len' });
    await act(async () => {
      jest.advanceTimersByTime(149);
    });
    // Each keystroke restarted the wait, so nothing has settled yet.
    expect(result.current).toBe('');
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current).toBe('len');
  });

  it('applies clearing at once', async () => {
    const { result, rerender } = await renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value),
      {
        initialProps: { value: 'soup' },
      },
    );
    await rerender({ value: '' });
    expect(result.current).toBe('');
  });
});
