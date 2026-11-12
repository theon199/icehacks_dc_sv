/**
 * Every time the person cooked something, with their rating and notes. One synced document per
 * entry; the newest 5,000 are kept.
 */
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { newId } from '@/lib/id';

import { createSelector } from './memo';
import { BURST_WRITE_WINDOW_MS, versionedPersist } from './persistence';
import { applyToRecord, createCollectionAdapter } from './syncAdapter';

export const MAX_COOK_ENTRIES = 5000;

export const cookEntrySchema = z.object({
  id: z.string().min(1).max(64),
  recipeId: z.string().min(1).max(128),
  cookedAt: z.string(),
  rating: z.number().int().min(1).max(5).nullable(),
  wouldCookAgain: z.boolean().nullable(),
  /** What the person changed or noticed. */
  notes: z.string().max(1000).nullable(),
  servings: z.number().int().min(1).max(50).nullable(),
});
export type CookEntry = z.infer<typeof cookEntrySchema>;

export interface NewCookEntry {
  recipeId: string;
  rating?: number | null;
  wouldCookAgain?: boolean | null;
  notes?: string | null;
  servings?: number | null;
}

type Entries = Readonly<Record<string, CookEntry>>;

const byCookedAt = (a: CookEntry, b: CookEntry) =>
  a.cookedAt.localeCompare(b.cookedAt) || a.id.localeCompare(b.id);

export function trimEntries(entries: Entries, max: number = MAX_COOK_ENTRIES): Entries {
  const all = Object.values(entries);
  if (all.length <= max) return entries;
  return Object.fromEntries(
    all
      .sort(byCookedAt)
      .slice(-max)
      .map((entry) => [entry.id, entry]),
  );
}

export function logCook(
  entries: Entries,
  input: NewCookEntry,
  meta: { id: string; at: string },
): Entries {
  const parsed = cookEntrySchema.safeParse({
    id: meta.id,
    recipeId: input.recipeId,
    cookedAt: meta.at,
    rating: input.rating ?? null,
    wouldCookAgain: input.wouldCookAgain ?? null,
    notes: input.notes?.trim() || null,
    servings: input.servings ?? null,
  });
  if (!parsed.success) return entries;
  return trimEntries({ ...entries, [meta.id]: parsed.data });
}

export function updateCook(
  entries: Entries,
  id: string,
  patch: Partial<Omit<CookEntry, 'id' | 'recipeId'>>,
): Entries {
  const current = entries[id];
  if (!current) return entries;
  const parsed = cookEntrySchema.safeParse({
    ...current,
    ...patch,
    id,
    recipeId: current.recipeId,
  });
  if (!parsed.success) return entries;
  return { ...entries, [id]: parsed.data };
}

export function removeCook(entries: Entries, id: string): Entries {
  if (!entries[id]) return entries;
  const next = { ...entries };
  delete next[id];
  return next;
}

export interface CookLogState {
  entries: Entries;
  /** Returns the new entry's id, or null when the input was invalid. */
  log: (input: NewCookEntry, at?: string) => string | null;
  update: (id: string, patch: Partial<Omit<CookEntry, 'id' | 'recipeId'>>) => void;
  remove: (id: string) => void;
  reset: () => void;
}

export const useCookLogStore = create<CookLogState>()(
  persist(
    (set, get) => {
      const commit = (next: Entries) => {
        if (next !== get().entries) set({ entries: next });
      };
      return {
        entries: {},
        log: (input, at = new Date().toISOString()) => {
          const id = newId();
          const next = logCook(get().entries, input, { id, at });
          commit(next);
          return next[id] ? id : null;
        },
        update: (id, patch) => commit(updateCook(get().entries, id, patch)),
        remove: (id) => commit(removeCook(get().entries, id)),
        reset: () => set({ entries: {} }),
      };
    },
    versionedPersist({
      name: 'user.cook_log',
      version: 1,
      throttleMs: BURST_WRITE_WINDOW_MS,
      schema: z.object({ entries: z.record(z.string(), cookEntrySchema) }),
      partialize: (state) => ({ entries: state.entries }),
    }),
  ),
);

/** Entries, most recent first. */
export const selectCookEntries = createSelector(
  (state: CookLogState) => state.entries,
  (entries) => Object.values(entries).sort(byCookedAt).reverse(),
);

export const selectCookCount = (state: CookLogState) => Object.keys(state.entries).length;

/** When each recipe was last cooked. */
export const selectLastCookedAt = createSelector(
  (state: CookLogState) => state.entries,
  (entries): Readonly<Record<string, string>> => {
    const last: Record<string, string> = {};
    for (const entry of Object.values(entries)) {
      const previous = last[entry.recipeId];
      if (!previous || entry.cookedAt > previous) last[entry.recipeId] = entry.cookedAt;
    }
    return last;
  },
);

export const cookLogSync = createCollectionAdapter({
  collection: 'cook_log',
  // Ids come from newId() and are never reused.
  uniqueIds: true,
  store: useCookLogStore,
  select: (state) => state.entries,
  schema: cookEntrySchema,
  apply: (state, changes) => ({ entries: trimEntries(applyToRecord(state.entries, changes)) }),
});
