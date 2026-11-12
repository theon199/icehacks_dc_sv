import { profileKeys } from '@/features/profile';
import { queryClient } from '@/lib/query/client';

import { completionDeps } from './useCompleteCook';
import type { CookEventRequest } from '../logic/completion';
import { recordCookEvent } from '../services/cookEvents';
import { usePendingCookEvents } from '../services/pendingCookEvents';

jest.mock('../services/cookEvents', () => ({
  recordCookEvent: jest.fn(),
  classifyCookEventError: () => 'retry',
}));

const request: CookEventRequest = {
  recipeRef: 'mealdb:1',
  localDate: '2026-11-12',
  cookedAt: new Date().toISOString(),
  cuisine: null,
  rating: null,
  clientEventId: 'evt-1',
};

beforeEach(() => {
  usePendingCookEvents.getState().reset();
  jest.mocked(recordCookEvent).mockReset();
});

describe('completionDeps', () => {
  it('clears a queued copy and refreshes stats when a slow answer arrives after queueing', async () => {
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    let answer: () => void = () => undefined;
    jest.mocked(recordCookEvent).mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = () => resolve({ eventId: 'server-1', newBadges: [] });
        }),
    );
    const deps = completionDeps('user-1');

    const sending = deps.recordCookEvent(request);
    // Save gave up waiting and queued the cook.
    deps.enqueue(request);
    expect(usePendingCookEvents.getState().events).toHaveLength(1);

    answer();
    await sending;
    expect(usePendingCookEvents.getState().events).toEqual([]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: profileKeys.statsAll('user-1') });
    invalidate.mockRestore();
  });

  it('neither sends nor queues without an account', async () => {
    const deps = completionDeps(null);
    await expect(deps.recordCookEvent(request)).rejects.toThrow('signed out');
    expect(deps.enqueue(request)).toBe(false);
    expect(recordCookEvent).not.toHaveBeenCalled();
  });
});
