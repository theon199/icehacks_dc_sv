import { useSessionStore } from '@/features/auth';

import { classifyCookEventError } from './cookEvents';
import { flushPendingCookEvents, keepOwnedBy, usePendingCookEvents } from './pendingCookEvents';
import type { CookEventRequest } from '../logic/completion';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 12, 18, 0);

function request(clientEventId: string, cookedAt: number = NOW): CookEventRequest {
  return {
    recipeRef: 'mealdb:1',
    localDate: '2026-11-12',
    cookedAt: new Date(cookedAt).toISOString(),
    cuisine: null,
    rating: null,
    clientEventId,
  };
}

const queuedIds = () =>
  usePendingCookEvents.getState().events.map((event) => event.request.clientEventId);

const signIn = (userId: string) =>
  useSessionStore.getState().signedIn({ userId, birthYear: 1990, onboardingComplete: true });

beforeEach(() => {
  useSessionStore.getState().signedOut();
  usePendingCookEvents.getState().reset();
});

describe('flushPendingCookEvents', () => {
  it("drops other accounts' expired events but keeps their fresh ones", async () => {
    const queue = usePendingCookEvents.getState();
    queue.add('user-2', request('other-old', NOW - 40 * DAY_MS));
    queue.add('user-2', request('other-fresh'));
    queue.add('user-1', request('mine'));
    const rpc = jest.fn().mockResolvedValue({ eventId: 'x', newBadges: [] });

    const delivered = await flushPendingCookEvents('user-1', {
      recordCookEvent: rpc,
      classifyFailure: classifyCookEventError,
      now: () => NOW,
    });

    expect(delivered).toBe(1);
    expect(rpc.mock.calls.map(([sent]) => sent.clientEventId)).toEqual(['mine']);
    expect(queuedIds()).toEqual(['other-fresh']);
  });

  it('gives up for now when a send stalls, keeping the event queued', async () => {
    const queue = usePendingCookEvents.getState();
    queue.add('user-1', request('stalled'));
    queue.add('user-1', request('next'));
    const rpc = jest.fn(() => new Promise<never>(() => undefined));

    const delivered = await flushPendingCookEvents('user-1', {
      recordCookEvent: rpc,
      classifyFailure: classifyCookEventError,
      now: () => NOW,
      timeoutMs: 5,
    });

    expect(delivered).toBe(0);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(queuedIds()).toEqual(['stalled', 'next']);
  });

  it('stops sending once the person signs out during the run', async () => {
    signIn('user-1');
    const queue = usePendingCookEvents.getState();
    queue.add('user-1', request('first'));
    queue.add('user-1', request('second'));
    const rpc = jest.fn(async () => {
      useSessionStore.getState().signedOut();
      return { eventId: 'x', newBadges: [] };
    });

    await flushPendingCookEvents('user-1', {
      recordCookEvent: rpc,
      classifyFailure: classifyCookEventError,
      now: () => NOW,
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(queuedIds()).toEqual([]);
  });
});

describe('queue ownership', () => {
  it('forgets every queued cook when the person signs out (also after deleting the account)', () => {
    signIn('user-1');
    usePendingCookEvents.getState().add('user-1', request('a'));
    usePendingCookEvents.getState().add('user-1', request('b'));

    useSessionStore.getState().signedOut();

    expect(queuedIds()).toEqual([]);
  });

  it("forgets another account's leftovers when someone signs in", () => {
    usePendingCookEvents.getState().add('user-1', request('theirs'));
    usePendingCookEvents.getState().add('user-2', request('mine'));

    signIn('user-2');

    expect(queuedIds()).toEqual(['mine']);
  });

  it('keeps the queue for the account that stays signed in', () => {
    signIn('user-1');
    usePendingCookEvents.getState().add('user-1', request('a'));

    useSessionStore.getState().setAiConsent(true);

    expect(queuedIds()).toEqual(['a']);
  });

  it('returns the same list when nothing has to go', () => {
    const events = [{ ownerId: 'user-1', request: request('a') }];
    expect(keepOwnedBy(events, 'user-1')).toBe(events);
    expect(keepOwnedBy(events, null)).toEqual([]);
  });
});
