/**
 * Cook events the server has not acknowledged yet (offline, or the request failed on the way).
 * Kept on this device per account and retried whenever cook mode opens; the server ignores a
 * repeat of the same `clientEventId`, so a retry after a lost response is harmless.
 */
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { describeError, logger } from '@/lib/logger';
import { persistStorage } from '@/lib/storage/kv';

import type { CookEventFailure, CookEventRequest, CookEventResponse } from '../logic/completion';

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

export interface FlushDeps {
  recordCookEvent(request: CookEventRequest): Promise<CookEventResponse>;
  classifyFailure(error: unknown): CookEventFailure;
  now?: () => number;
}

let flushing: Promise<number> | null = null;

/**
 * Sends this account's queued cooks in order. Stops at the first temporary failure (the network is
 * likely down) and drops events the server refuses or that have grown too old to be accepted.
 * Returns how many were delivered. Concurrent calls share one run.
 */
export function flushPendingCookEvents(ownerId: string, deps: FlushDeps): Promise<number> {
  if (flushing) return flushing;
  flushing = runFlush(ownerId, deps).finally(() => {
    flushing = null;
  });
  return flushing;
}

async function runFlush(ownerId: string, deps: FlushDeps): Promise<number> {
  const store = usePendingCookEvents.getState();
  const now = (deps.now ?? Date.now)();
  let delivered = 0;
  for (const event of store.events) {
    if (event.ownerId !== ownerId) continue;
    const id = event.request.clientEventId;
    if (!isFresh(event, now)) {
      usePendingCookEvents.getState().remove(id);
      continue;
    }
    try {
      await deps.recordCookEvent(event.request);
      usePendingCookEvents.getState().remove(id);
      delivered += 1;
    } catch (error) {
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
