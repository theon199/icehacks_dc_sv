import { act, renderHook } from '@testing-library/react-native';

import { nextPhase, useSubmission } from './useSubmission';

describe('nextPhase', () => {
  it('moves between idle, busy and failed', () => {
    const busy = nextPhase({ kind: 'idle' }, { type: 'begin' });
    expect(busy).toEqual({ kind: 'busy' });
    expect(nextPhase(busy, { type: 'fail', message: 'No' })).toEqual({
      kind: 'failed',
      message: 'No',
    });
    expect(nextPhase(busy, { type: 'succeed' })).toEqual({ kind: 'idle' });
    expect(nextPhase({ kind: 'failed', message: 'No' }, { type: 'clear' })).toEqual({
      kind: 'idle',
    });
  });
});

describe('useSubmission', () => {
  it('shows the message the work reports, and clears it on the next attempt', async () => {
    const { result } = await renderHook(() => useSubmission());
    await act(() => result.current.submit(async () => 'Wrong password'));
    expect(result.current.failure).toBe('Wrong password');

    let finish: () => void = () => undefined;
    let pending: Promise<void> = Promise.resolve();
    await act(async () => {
      pending = result.current.submit(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
    });
    expect(result.current).toMatchObject({ busy: true, failure: null });

    await act(async () => {
      finish();
      await pending;
    });
    expect(result.current).toMatchObject({ busy: false, failure: null });
  });

  it('ignores a second submit while the first is in flight', async () => {
    const { result } = await renderHook(() => useSubmission());
    const work = jest.fn(() => new Promise<null>(() => undefined));
    await act(async () => {
      void result.current.submit(work);
      void result.current.submit(work);
    });
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('turns an unexpected throw into a general message', async () => {
    const { result } = await renderHook(() => useSubmission());
    await act(() =>
      result.current.submit(async () => {
        throw new Error('boom');
      }),
    );
    expect(result.current.failure).toMatch(/Something went wrong/);
  });
});
