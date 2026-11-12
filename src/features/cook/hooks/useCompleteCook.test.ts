import { useSessionStore } from '@/features/auth';
import { profileKeys } from '@/features/profile';
import { queryClient } from '@/lib/query/client';

import { completionDeps } from './useCompleteCook';
import { reportCook, type CookEventRequest } from '../logic/completion';
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

const signIn = (userId: string) =>
  useSessionStore.getState().signedIn({ userId, birthYear: 1990, onboardingComplete: true });

beforeEach(() => {
  useSessionStore.getState().signedOut();
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
    signIn('user-1');
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

  it('does not queue a slow cook under an account that signed out while Save was waiting', async () => {
    jest.mocked(recordCookEvent).mockImplementation(() => new Promise(() => undefined));
    signIn('user-1');
    const deps = completionDeps('user-1');

    const saving = reportCook(request, deps, 20);
    useSessionStore.getState().signedOut();

    await expect(saving).resolves.toEqual({ status: 'local_only' });
    expect(usePendingCookEvents.getState().events).toEqual([]);
  });

  it('does not queue under the previous account after switching to another one', () => {
    signIn('user-2');
    expect(completionDeps('user-1').enqueue(request)).toBe(false);
    expect(usePendingCookEvents.getState().events).toEqual([]);
  });
});
