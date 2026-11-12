import { RANKING_CONFIG_V1 } from '@/domain/recommend/config';
import { selectCookEntries, useCookLogStore, useFeedbackStore } from '@/stores';

import {
  badgeMessage,
  buildCookEventRequest,
  completeCook,
  COOK_EVENT_TIMEOUT_MS,
  type CompletionDeps,
  type CookCompletion,
} from './completion';
import { localDateString } from './session';
import { classifyCookEventError, CookEventError } from '../services/cookEvents';
import { flushPendingCookEvents, usePendingCookEvents } from '../services/pendingCookEvents';

jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` };
});

const cookedAt = new Date(2026, 10, 11, 19, 30);

const completion = (overrides: Partial<CookCompletion> = {}): CookCompletion => ({
  recipeId: 'mealdb:52772',
  cuisine: 'japanese',
  rating: 4,
  wouldCookAgain: true,
  notes: '  Used less soy sauce  ',
  servings: 2,
  cookedAt,
  clientEventId: '11111111-1111-4111-8111-111111111111',
  ...overrides,
});

function storeDeps(recordCookEvent: CompletionDeps['recordCookEvent']): CompletionDeps {
  return {
    logCook: (entry, at) => useCookLogStore.getState().log(entry, at),
    recordFeedback: (event, at) => useFeedbackStore.getState().record(event, at),
    recordCookEvent,
    classifyFailure: classifyCookEventError,
    enqueue: (request) => {
      usePendingCookEvents.getState().add('user-1', request);
      return true;
    },
    localDate: localDateString,
  };
}

beforeEach(() => {
  useCookLogStore.getState().reset();
  useFeedbackStore.getState().reset();
  usePendingCookEvents.getState().reset();
});

describe('completeCook', () => {
  it('logs the cook, records a +2 cooked signal and reports the cook event', async () => {
    const rpc = jest.fn().mockResolvedValue({ eventId: 'evt', newBadges: ['first_cook'] });

    const outcome = await completeCook(completion(), storeDeps(rpc));

    expect(outcome).toEqual({
      status: 'synced',
      entryId: expect.any(String),
      newBadges: ['first_cook'],
    });

    const [entry] = selectCookEntries(useCookLogStore.getState());
    expect(entry).toMatchObject({
      recipeId: 'mealdb:52772',
      rating: 4,
      wouldCookAgain: true,
      notes: 'Used less soy sauce',
      servings: 2,
      cookedAt: cookedAt.toISOString(),
    });

    const events = Object.values(useFeedbackStore.getState().events);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ recipeId: 'mealdb:52772', kind: 'cooked' });
    expect(events[0]?.kind === 'cooked' && RANKING_CONFIG_V1.taste.signal.cooked).toBe(2);

    expect(rpc).toHaveBeenCalledWith({
      recipeRef: 'mealdb:52772',
      localDate: '2026-11-11',
      cookedAt: cookedAt.toISOString(),
      cuisine: 'japanese',
      rating: 4,
      clientEventId: '11111111-1111-4111-8111-111111111111',
    });
    expect(usePendingCookEvents.getState().events).toEqual([]);
  });

  it('keeps the cook locally and queues the event when offline', async () => {
    const rpc = jest.fn().mockRejectedValue(new TypeError('Network request failed'));

    const outcome = await completeCook(completion(), storeDeps(rpc));

    expect(outcome.status).toBe('queued');
    expect(selectCookEntries(useCookLogStore.getState())).toHaveLength(1);
    expect(Object.keys(useFeedbackStore.getState().events)).toHaveLength(1);
    expect(usePendingCookEvents.getState().events).toEqual([
      {
        ownerId: 'user-1',
        request: expect.objectContaining({
          clientEventId: '11111111-1111-4111-8111-111111111111',
        }),
      },
    ]);
  });

  it('queues the event when the server does not answer in time, so Save never hangs', async () => {
    jest.useFakeTimers();
    try {
      const stalled = jest.fn(() => new Promise<never>(() => undefined));
      const saving = completeCook(completion(), storeDeps(stalled));

      await jest.advanceTimersByTimeAsync(COOK_EVENT_TIMEOUT_MS - 1);
      expect(usePendingCookEvents.getState().events).toEqual([]);
      await jest.advanceTimersByTimeAsync(1);

      await expect(saving).resolves.toMatchObject({ status: 'queued' });
      expect(usePendingCookEvents.getState().events.map((e) => e.request.clientEventId)).toEqual([
        '11111111-1111-4111-8111-111111111111',
      ]);
      expect(selectCookEntries(useCookLogStore.getState())).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('reports local_only when there is no account to queue the event for', async () => {
    const rpc = jest.fn().mockRejectedValue(new Error('signed out'));
    const deps: CompletionDeps = { ...storeDeps(rpc), enqueue: () => false };

    const outcome = await completeCook(completion(), deps);

    expect(outcome.status).toBe('local_only');
    expect(selectCookEntries(useCookLogStore.getState())).toHaveLength(1);
  });

  it('does not queue an event the server refused', async () => {
    const rpc = jest.fn().mockRejectedValue(new CookEventError('rate_limited', 'PT429'));
    const outcome = await completeCook(completion(), storeDeps(rpc));
    expect(outcome.status).toBe('local_only');
    expect(usePendingCookEvents.getState().events).toEqual([]);
    expect(selectCookEntries(useCookLogStore.getState())).toHaveLength(1);
  });

  it('leaves out an invalid rating, empty notes and a cuisine the server would reject', async () => {
    const rpc = jest.fn().mockResolvedValue({ eventId: 'evt', newBadges: [] });
    await completeCook(
      completion({ rating: 9, notes: '   ', cuisine: 'Not A Cuisine', wouldCookAgain: null }),
      storeDeps(rpc),
    );
    expect(rpc).toHaveBeenCalledWith(expect.objectContaining({ rating: null, cuisine: null }));
    expect(selectCookEntries(useCookLogStore.getState())[0]).toMatchObject({
      rating: null,
      notes: null,
      wouldCookAgain: null,
    });
  });
});

describe('flushPendingCookEvents', () => {
  const request = (id: string, at: Date = new Date()) =>
    buildCookEventRequest(completion({ clientEventId: id, cookedAt: at }), localDateString);

  it('delivers queued events for the signed-in account only', async () => {
    const queue = usePendingCookEvents.getState();
    queue.add('user-1', request('a'));
    queue.add('user-2', request('b'));
    queue.add('user-1', request('c'));
    queue.add('user-1', request('a'));
    const rpc = jest.fn().mockResolvedValue({ eventId: 'x', newBadges: [] });

    const delivered = await flushPendingCookEvents('user-1', {
      recordCookEvent: rpc,
      classifyFailure: classifyCookEventError,
      currentUserId: () => 'user-1',
    });

    expect(delivered).toBe(2);
    expect(rpc.mock.calls.map(([sent]) => sent.clientEventId)).toEqual(['a', 'c']);
    expect(usePendingCookEvents.getState().events.map((e) => e.request.clientEventId)).toEqual([
      'b',
    ]);
  });

  it('stops at a network failure and drops refused or expired events', async () => {
    const queue = usePendingCookEvents.getState();
    const now = Date.now();
    queue.add('user-1', request('old', new Date(now - 40 * 24 * 3600 * 1000)));
    queue.add('user-1', request('refused'));
    queue.add('user-1', request('offline'));
    queue.add('user-1', request('later'));
    const rpc = jest
      .fn()
      .mockRejectedValueOnce(new CookEventError('invalid', '22023'))
      .mockRejectedValueOnce(new TypeError('Network request failed'));

    const delivered = await flushPendingCookEvents('user-1', {
      recordCookEvent: rpc,
      classifyFailure: classifyCookEventError,
      now: () => now,
      currentUserId: () => 'user-1',
    });

    expect(delivered).toBe(0);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(usePendingCookEvents.getState().events.map((e) => e.request.clientEventId)).toEqual([
      'offline',
      'later',
    ]);
  });
});

describe('classifyCookEventError', () => {
  it('retries connection and session problems, drops bad input and the daily limit', () => {
    expect(classifyCookEventError(new TypeError('Network request failed'))).toBe('retry');
    expect(classifyCookEventError(new CookEventError('x', null))).toBe('retry');
    expect(classifyCookEventError(new CookEventError('x', 'PT401'))).toBe('retry');
    expect(classifyCookEventError(new CookEventError('x', '22023'))).toBe('drop');
    expect(classifyCookEventError(new CookEventError('x', 'PT429'))).toBe('drop');
  });

  it('drops cooks from an account that may not record them (suspended or age gate)', () => {
    expect(classifyCookEventError(new CookEventError('suspended', 'PT403'))).toBe('drop');
  });
});

describe('badgeMessage', () => {
  it('counts the badges just earned without restating their names', () => {
    expect(badgeMessage([])).toBeNull();
    expect(badgeMessage(['first_cook'])).toBe('You earned a new badge. See it on your profile.');
    expect(badgeMessage(['first_cook', 'streak_3', 'first_cook'])).toBe(
      'You earned 2 new badges. See them on your profile.',
    );
  });
});

describe('flushPendingCookEvents across accounts', () => {
  it('runs a separate flush for the next account while the first is still sending', async () => {
    let signedIn = 'user-1';
    const currentUserId = () => signedIn;
    const at = new Date();
    const queue = usePendingCookEvents.getState();
    queue.add(
      'user-1',
      buildCookEventRequest(completion({ clientEventId: 'one', cookedAt: at }), localDateString),
    );
    queue.add(
      'user-2',
      buildCookEventRequest(completion({ clientEventId: 'two', cookedAt: at }), localDateString),
    );
    let release: () => void = () => undefined;
    const slow = jest.fn(
      () =>
        new Promise<{ eventId: string; newBadges: string[] }>((resolve) => {
          release = () => resolve({ eventId: 'x', newBadges: [] });
        }),
    );
    const fast = jest.fn().mockResolvedValue({ eventId: 'y', newBadges: [] });

    const first = flushPendingCookEvents('user-1', {
      recordCookEvent: slow,
      classifyFailure: classifyCookEventError,
      currentUserId,
    });
    const again = flushPendingCookEvents('user-1', {
      recordCookEvent: fast,
      classifyFailure: classifyCookEventError,
      currentUserId,
    });
    // The first account's send is already on its way when the next account signs in.
    signedIn = 'user-2';
    const second = flushPendingCookEvents('user-2', {
      recordCookEvent: fast,
      classifyFailure: classifyCookEventError,
      currentUserId,
    });

    expect(again).toBe(first);
    await expect(second).resolves.toBe(1);
    expect(fast.mock.calls.map(([sent]) => sent.clientEventId)).toEqual(['two']);
    release();
    await expect(first).resolves.toBe(1);
    expect(usePendingCookEvents.getState().events).toEqual([]);
  });
});
