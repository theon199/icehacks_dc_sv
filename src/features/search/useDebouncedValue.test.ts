import { act, renderHook } from '@testing-library/react-native';

import { SEARCH_DEBOUNCE_MS, useDebouncedValue } from './useDebouncedValue';

interface Probe {
  readonly type: (text: string) => Promise<void>;
  readonly wait: (ms: number) => Promise<void>;
  readonly shown: () => string;
}

/** Mounts the hook with a starting text and returns small helpers to drive it like a search box. */
async function mountDebounced(initial: string): Promise<Probe> {
  let text = initial;
  const hook = await renderHook(() => useDebouncedValue(text));
  return {
    type: async (next) => {
      text = next;
      await hook.rerender(undefined);
    },
    wait: async (ms) => {
      await act(async () => {
        jest.advanceTimersByTime(ms);
      });
    },
    shown: () => hook.result.current,
  };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('useDebouncedValue', () => {
  it('settles only once typing has paused for the full delay', async () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(150);
    const box = await mountDebounced('');
    for (const text of ['l', 'le']) {
      await box.type(text);
      await box.wait(100);
    }
    await box.type('len');
    await box.wait(SEARCH_DEBOUNCE_MS - 1);
    expect(box.shown()).toBe('');
    await box.wait(1);
    expect(box.shown()).toBe('len');
  });

  it('passes an emptied box through without waiting', async () => {
    const box = await mountDebounced('soup');
    await box.type('');
    expect(box.shown()).toBe('');
  });
});
