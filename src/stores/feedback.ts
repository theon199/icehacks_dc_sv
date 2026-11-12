/**
 * Recommendation feedback: swipes, saves, cooks and "not for me" reasons. Events are immutable;
 * the newest 2,000 are kept (older ones are dropped here and, through sync, on the server too).
 * One synced document per event, so devices never overwrite each other's events.
 */
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { newId } from '@/lib/id';

import { createSelector } from './memo';
import { versionedPersist } from './persistence';
import { applyToRecord, createCollectionAdapter } from './syncAdapter';

export const MAX_FEEDBACK_EVENTS = 2000;

export const FEEDBACK_KINDS = ['like', 'pass', 'save', 'unsave', 'cooked', 'not_for_me'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const NOT_FOR_ME_REASONS = [
  'too_long',
  'dislike_ingredient',
  'not_my_cuisine',
  'too_heavy',
] as const;
export type NotForMeReason = (typeof NOT_FOR_ME_REASONS)[number];

export const feedbackEventSchema = z.object({
  id: z.string().min(1).max(64),
  recipeId: z.string().min(1).max(128),
  kind: z.enum(FEEDBACK_KINDS),
  reason: z.enum(NOT_FOR_ME_REASONS).nullable(),
  /** The ingredient behind a `dislike_ingredient` reason, when known. */
  ingredientId: z.string().min(1).max(64).nullable(),
  at: z.string(),
});
export type FeedbackEvent = z.infer<typeof feedbackEventSchema>;

export interface NewFeedbackEvent {
  recipeId: string;
  kind: FeedbackKind;
  reason?: NotForMeReason | null;
  ingredientId?: string | null;
}

type Events = Readonly<Record<string, FeedbackEvent>>;

const byTime = (a: FeedbackEvent, b: FeedbackEvent) =>
  a.at.localeCompare(b.at) || a.id.localeCompare(b.id);

/** Keeps the newest `max` events. */
export function trimEvents(events: Events, max: number = MAX_FEEDBACK_EVENTS): Events {
  const all = Object.values(events);
  if (all.length <= max) return events;
  const keep = all.sort(byTime).slice(-max);
  return Object.fromEntries(keep.map((event) => [event.id, event]));
}

export function recordEvents(
  events: Events,
  inputs: readonly (NewFeedbackEvent & { id: string; at: string })[],
): Events {
  const added: Record<string, FeedbackEvent> = {};
  for (const input of inputs) {
    const parsed = feedbackEventSchema.safeParse({
      id: input.id,
      recipeId: input.recipeId,
      kind: input.kind,
      reason: input.reason ?? null,
      ingredientId: input.ingredientId ?? null,
      at: input.at,
    });
    if (parsed.success && !events[parsed.data.id]) added[parsed.data.id] = parsed.data;
  }
  if (Object.keys(added).length === 0) return events;
  return trimEvents({ ...events, ...added });
}

export interface FeedbackState {
  events: Events;
  record: (input: NewFeedbackEvent, at?: string) => void;
  recordMany: (inputs: readonly NewFeedbackEvent[], at?: string) => void;
  reset: () => void;
}

export const useFeedbackStore = create<FeedbackState>()(
  persist(
    (set, get) => {
      const commit = (next: Events) => {
        if (next !== get().events) set({ events: next });
      };
      return {
        events: {},
        record: (input, at = new Date().toISOString()) =>
          commit(recordEvents(get().events, [{ ...input, id: newId(), at }])),
        recordMany: (inputs, at = new Date().toISOString()) =>
          commit(
            recordEvents(
              get().events,
              inputs.map((input) => ({ ...input, id: newId(), at })),
            ),
          ),
        reset: () => set({ events: {} }),
      };
    },
    versionedPersist({
      name: 'user.feedback',
      version: 1,
      schema: z.object({ events: z.record(z.string(), feedbackEventSchema) }),
      partialize: (state) => ({ events: state.events }),
    }),
  ),
);

/** All kept events, oldest first (the order ranking decays them in). */
export const selectFeedbackEvents = createSelector(
  (state: FeedbackState) => state.events,
  (events) => Object.values(events).sort(byTime),
);

export const selectFeedbackCount = (state: FeedbackState) => Object.keys(state.events).length;

export const feedbackSync = createCollectionAdapter({
  collection: 'feedback',
  store: useFeedbackStore,
  select: (state) => state.events,
  schema: feedbackEventSchema,
  // Merging another device's events can push the total over the cap; the oldest go first.
  apply: (state, changes) => ({ events: trimEvents(applyToRecord(state.events, changes)) }),
});
