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
      currentUserId: () => 'user-1',
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
      currentUserId: () => 'user-1',
    });

    expect(delivered).toBe(0);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(queuedIds()).toEqual(['stalled', 'next']);
  });

  it('removes the queued copy when a send that timed out is accepted later', async () => {
    usePendingCookEvents.getState().add('user-1', request('late'));
    let answer: () => void = () => undefined;
    const rpc = jest.fn(
      () =>
        new Promise<{ eventId: string; newBadges: string[] }>((resolve) => {
          answer = () => resolve({ eventId: 'x', newBadges: [] });
        }),
    );

    const delivered = await flushPendingCookEvents('user-1', {
      recordCookEvent: rpc,
      classifyFailure: classifyCookEventError,
      now: () => NOW,
      timeoutMs: 5,
      currentUserId: () => 'user-1',
    });
    expect(delivered).toBe(0);
    expect(queuedIds()).toEqual(['late']);

    answer();
    await Promise.resolve();
    await Promise.resolve();
    expect(queuedIds()).toEqual([]);
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

describe('flushPendingCookEvents account binding', () => {
  const ok = { eventId: 'x', newBadges: [] };

  it('sends nothing when the run starts for an account that is not signed in', async () => {
    signIn('user-1');
    usePendingCookEvents.getState().add('user-1', request('mine'));
    const rpc = jest.fn().mockResolvedValue(ok);

    const delivered = await flushPendingCookEvents('user-1', {
      recordCookEvent: rpc,
      classifyFailure: classifyCookEventError,
      now: () => NOW,
      currentUserId: () => 'user-2',
    });

    expect(delivered).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sends nothing for a run started while signed out', async () => {
    usePendingCookEvents.getState().add('user-1', request('mine'));
    const rpc = jest.fn().mockResolvedValue(ok);

    await flushPendingCookEvents('user-1', {
      recordCookEvent: rpc,
      classifyFailure: classifyCookEventError,
      now: () => NOW,
    });

    expect(rpc).not.toHaveBeenCalled();
  });

  it('stops before the next send once another account is signed in, even if the queue lags', async () => {
    let signedIn = 'user-1';
    const queue = usePendingCookEvents.getState();
    queue.add('user-1', request('first'));
    queue.add('user-1', request('second'));
    queue.add('user-1', request('third'));
    const rpc = jest.fn(async () => {
      // The session moves on before the queue is told to forget the old account.
      signedIn = 'user-2';
      return ok;
    });

    const delivered = await flushPendingCookEvents('user-1', {
      recordCookEvent: rpc,
      classifyFailure: classifyCookEventError,
      now: () => NOW,
      currentUserId: () => signedIn,
    });

    expect(delivered).toBe(1);
    expect(rpc.mock.calls.map(([sent]) => sent.clientEventId)).toEqual(['first']);
  });

  it('stops before the next send when the session store switches accounts mid-run', async () => {
    signIn('user-1');
    const queue = usePendingCookEvents.getState();
    queue.add('user-1', request('first'));
    queue.add('user-1', request('second'));
    const rpc = jest.fn(async () => {
      signIn('user-2');
      return ok;
    });

    await flushPendingCookEvents('user-1', {
      recordCookEvent: rpc,
      classifyFailure: classifyCookEventError,
      now: () => NOW,
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(queuedIds()).toEqual([]);
  });

  it('sends every queued cook while the same account stays signed in', async () => {
    signIn('user-1');
    const queue = usePendingCookEvents.getState();
    queue.add('user-1', request('first'));
    queue.add('user-1', request('second'));
    const rpc = jest.fn().mockResolvedValue(ok);

    const delivered = await flushPendingCookEvents('user-1', {
      recordCookEvent: rpc,
      classifyFailure: classifyCookEventError,
      now: () => NOW,
    });

    expect(delivered).toBe(2);
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
