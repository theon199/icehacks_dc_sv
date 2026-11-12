/**
 * Things the person adds to the shopping list by hand ("dish soap", "birthday candles"). They sit
 * beside the plan-derived items and are ticked with the same check-off store, under `x:<id>` keys.
 * Stored on this device and tied to the account that added them: when a different account signs
 * in on the same phone, the list starts empty instead of showing someone else's extras.
 */
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { newId } from '@/lib/id';
import { createSelector } from '@/stores/memo';
import { versionedPersist } from '@/stores/persistence';

export const MAX_EXTRAS = 200;

export const extraItemSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(80),
  addedAt: z.string(),
});
export type ExtraItem = z.infer<typeof extraItemSchema>;

type Extras = Readonly<Record<string, ExtraItem>>;

const normalize = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

/** Check-off key for an extra; never collides with the domain's `i:` / `t:` item keys. */
export function extraKey(id: string): string {
  return `x:${id}`;
}

/** Adds an extra unless the same name is already listed, the name is blank, or the list is full. */
export function addExtra(extras: Extras, name: string, meta: { id: string; at: string }): Extras {
  const wanted = normalize(name);
  if (!wanted) return extras;
  if (Object.values(extras).some((item) => normalize(item.name) === wanted)) return extras;
  if (Object.keys(extras).length >= MAX_EXTRAS) return extras;
  const parsed = extraItemSchema.safeParse({
    id: meta.id,
    name: name.replace(/\s+/g, ' '),
    addedAt: meta.at,
  });
  return parsed.success ? { ...extras, [meta.id]: parsed.data } : extras;
}

export function removeExtras(extras: Extras, ids: readonly string[]): Extras {
  if (!ids.some((id) => id in extras)) return extras;
  const next = { ...extras };
  for (const id of ids) delete next[id];
  return next;
}

export interface ExtrasState {
  /** Account the extras belong to. */
  ownerId: string | null;
  extras: Extras;
  /** Makes `ownerId` the owner, dropping extras that belonged to anyone else. */
  claim: (ownerId: string | null) => void;
  add: (name: string, at?: string) => void;
  remove: (id: string) => void;
  removeMany: (ids: readonly string[]) => void;
  reset: () => void;
}

export const useShoppingExtrasStore = create<ExtrasState>()(
  persist(
    (set, get) => {
      const commit = (next: Extras) => {
        if (next !== get().extras) set({ extras: next });
      };
      return {
        ownerId: null,
        extras: {},
        claim: (ownerId) => {
          if (get().ownerId !== ownerId) set({ ownerId, extras: {} });
        },
        add: (name, at = new Date().toISOString()) =>
          commit(addExtra(get().extras, name, { id: newId(), at })),
        remove: (id) => commit(removeExtras(get().extras, [id])),
        removeMany: (ids) => commit(removeExtras(get().extras, ids)),
        reset: () => set({ ownerId: null, extras: {} }),
      };
    },
    versionedPersist({
      name: 'user.shopping_extras',
      version: 1,
      schema: z.object({
        ownerId: z.string().nullable(),
        extras: z.record(z.string(), extraItemSchema),
      }),
      partialize: (state) => ({ ownerId: state.ownerId, extras: state.extras }),
    }),
  ),
);

const NO_EXTRAS: readonly ExtraItem[] = [];

const sortedExtras = createSelector(
  (state: ExtrasState) => state.extras,
  (extras): readonly ExtraItem[] =>
    Object.values(extras).sort(
      (a, b) => a.addedAt.localeCompare(b.addedAt) || a.id.localeCompare(b.id),
    ),
);

/** The owner's extras in the order they were added; nothing for any other account. */
export const selectExtrasFor =
  (ownerId: string | null) =>
  (state: ExtrasState): readonly ExtraItem[] =>
    ownerId != null && state.ownerId === ownerId ? sortedExtras(state) : NO_EXTRAS;
