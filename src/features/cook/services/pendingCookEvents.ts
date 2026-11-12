/**
 * Cook events the server has not acknowledged yet (offline, or the request failed on the way).
 * Kept on this device per account and retried whenever cook mode opens; the server ignores a
 * repeat of the same `clientEventId`, so a retry after a lost response is harmless. Signing out
 * (which is also how account deletion ends) forgets them, so nothing waits on a shared device for
 * an account that has left.
 */
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { useSessionStore } from '@/features/auth';
import { describeError, logger } from '@/lib/logger';
import { persistStorage } from '@/lib/storage/kv';

import { isAccountMismatch } from './cookEvents';
import {
  COOK_EVENT_TIMEOUT_MS,
  withTimeout,
  type CookEventFailure,
  type CookEventRequest,
  type CookEventResponse,
} from '../logic/completion';

/** The server accepts cooks up to 30 days old; keep a margin for clock drift. */
const MAX_AGE_MS = 29 * 24 * 60 * 60 * 1000;
export const MAX_PENDING = 50;

const requestSchema = z.object({
  recipeRef: z.string().min(1).max(128),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cookedAt: z.string(),
  cuisine: z.string().nullable(),
  rating: z.number().int().min(1).max(5).nullable(),
  clientEventId: z.string().min(1),
});

const pendingSchema = z.object({ ownerId: z.string().min(1), request: requestSchema });
export type PendingCookEvent = z.infer<typeof pendingSchema>;

interface PendingState {
  events: readonly PendingCookEvent[];
  add: (ownerId: string, request: CookEventRequest) => void;
  remove: (clientEventId: string) => void;
  /** Forgets every event that does not belong to `ownerId` (all of them for null). */
  keepOnly: (ownerId: string | null) => void;
  reset: () => void;
}

const isFresh = (event: PendingCookEvent, now: number) => {
  const at = Date.parse(event.request.cookedAt);
  return Number.isFinite(at) && now - at < MAX_AGE_MS;
};

export function addPending(
  events: readonly PendingCookEvent[],
  ownerId: string,
  request: CookEventRequest,
): readonly PendingCookEvent[] {
  if (events.some((event) => event.request.clientEventId === request.clientEventId)) return events;
  return [...events, { ownerId, request }].slice(-MAX_PENDING);
}

export function keepOwnedBy(
  events: readonly PendingCookEvent[],
  ownerId: string | null,
): readonly PendingCookEvent[] {
  const kept = events.filter((event) => event.ownerId === ownerId);
  return kept.length === events.length ? events : kept;
}

export const usePendingCookEvents = create<PendingState>()(
  persist(
    (set) => ({
      events: [],
      add: (ownerId, request) =>
        set((state) => ({ events: addPending(state.events, ownerId, request) })),
      remove: (clientEventId) =>
        set((state) => ({
          events: state.events.filter((event) => event.request.clientEventId !== clientEventId),
        })),
      keepOnly: (ownerId) => set((state) => ({ events: keepOwnedBy(state.events, ownerId) })),
      reset: () => set({ events: [] }),
    }),
    {
      name: 'cook.pendingEvents',
      version: 1,
      storage: persistStorage<Pick<PendingState, 'events'>>(),
      partialize: (state) => ({ events: state.events }),
      // Anything that does not validate is dropped rather than retried forever.
      merge: (persisted, current) => {
        const parsed = z.object({ events: z.array(z.unknown()) }).safeParse(persisted);
        if (!parsed.success) return current;
        const events = parsed.data.events.flatMap((raw) => {
          const event = pendingSchema.safeParse(raw);
          return event.success ? [event.data] : [];
        });
        return { ...current, events };
      },
    },
  ),
);

const isQueued = (clientEventId: string) =>
  usePendingCookEvents
    .getState()
    .events.some((event) => event.request.clientEventId === clientEventId);

export interface FlushDeps {
  /** Sends one cook; `expectedUserId` is the account it was queued for. */
  recordCookEvent(request: CookEventRequest, expectedUserId: string): Promise<CookEventResponse>;
  classifyFailure(error: unknown): CookEventFailure;
  now?: () => number;
  /** How long one send may take before the run gives up until next time. */
  timeoutMs?: number;
  /** The account signed in right now; defaults to the session store. */
  currentUserId?: () => string | null;
}

const signedInUserId = () => useSessionStore.getState().userId;

/** Runs in progress, one per account, so a second account never piggybacks on the first. */
const inFlight = new Map<string, Promise<number>>();

/**
 * Sends this account's queued cooks in order. Stops at the first temporary failure (the network is
 * likely down, or a send stalled) and drops events the server refuses. Events too old to be
 * accepted are dropped for every account, so a queue left behind by someone else cannot linger.
 * Returns how many were delivered. Concurrent calls for the same account share one run.
 *
 * The run is bound to `ownerId`: the server records a cook for whoever is signed in when it is
 * sent, so before every send the run checks that `ownerId` is still the signed-in account, and
 * stops for good as soon as it is not (or never was). Each send also names `ownerId`, so a switch
 * the session store has not caught up with yet is refused by the server; that cook is dropped for
 * this account and the run stops.
 */
export function flushPendingCookEvents(ownerId: string, deps: FlushDeps): Promise<number> {
  const running = inFlight.get(ownerId);
  if (running) return running;
  const run = runFlush(ownerId, deps).finally(() => inFlight.delete(ownerId));
  inFlight.set(ownerId, run);
  return run;
}

async function runFlush(ownerId: string, deps: FlushDeps): Promise<number> {
  const now = (deps.now ?? Date.now)();
  const timeoutMs = deps.timeoutMs ?? COOK_EVENT_TIMEOUT_MS;
  const currentUserId = deps.currentUserId ?? signedInUserId;
  usePendingCookEvents.setState((state) => {
    const fresh = state.events.filter((event) => isFresh(event, now));
    return fresh.length === state.events.length ? state : { events: fresh };
  });
  let delivered = 0;
  for (const event of usePendingCookEvents.getState().events) {
    if (event.ownerId !== ownerId) continue;
    // Another account (or nobody) is signed in now: sending would record this cook for them.
    if (currentUserId() !== ownerId) {
      logger.info('Stopped sending queued cooks: the signed-in account changed');
      break;
    }
    const id = event.request.clientEventId;
    // Signing out during the run forgets the rest of the queue; never send what was forgotten.
    if (!isQueued(id)) continue;
    try {
      const send = deps.recordCookEvent(event.request, ownerId);
      // A send can still succeed after this run stopped waiting for it; the queued copy is then
      // done with, so it is not sent again on the next flush.
      send.then(() => usePendingCookEvents.getState().remove(id)).catch(() => undefined);
      await withTimeout(send, timeoutMs);
      usePendingCookEvents.getState().remove(id);
      delivered += 1;
    } catch (error) {
      if (isAccountMismatch(error)) {
        // Another account is signed in on the server side: nothing was recorded, and the rest of
        // the queue would be refused the same way.
        logger.info('Dropped a queued cook sent under another account');
        usePendingCookEvents.getState().remove(id);
        break;
      }
      if (deps.classifyFailure(error) === 'drop') {
        logger.warn('Dropping a queued cook the server refused', describeError(error));
        usePendingCookEvents.getState().remove(id);
        continue;
      }
      break;
    }
  }
  return delivered;
}

// A queue only ever serves the account that is signed in. Leaving an account (signing out, which
// also follows account deletion) forgets everything; signing in forgets other accounts' leftovers.
// This subscription exists from the moment the module is first imported, so a sign-out before then
// leaves the queue on disk until the next sign-in, which keeps only that account's events. Nothing
// is cleared at load while signed out: the session is still restoring then, and userId is null.
useSessionStore.subscribe((state, previous) => {
  if (state.userId !== previous.userId) usePendingCookEvents.getState().keepOnly(state.userId);
});
const signedInAtLoad = useSessionStore.getState().userId;
if (signedInAtLoad !== null) usePendingCookEvents.getState().keepOnly(signedInAtLoad);
