/**
 * Check-offs on the shopping list. The list itself is derived from the meal plan and pantry; only
 * which lines are ticked is stored. One synced document per ticked line, so ticking on two
 * phones in the same shop never loses a tick. At most 500 ticks are kept (the oldest go first),
 * which is far more than any one list and keeps a forgotten list from growing without end.
 */
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { createSelector } from './memo';
import { versionedPersist } from './persistence';
import { applyToRecord, createCollectionAdapter } from './syncAdapter';

const MAX_KEY_LENGTH = 120;
export const MAX_SHOPPING_CHECKS = 500;

export const shoppingCheckSchema = z.object({
  key: z.string().min(1).max(MAX_KEY_LENGTH),
  checkedAt: z.string(),
});
export type ShoppingCheck = z.infer<typeof shoppingCheckSchema>;

type Checks = Readonly<Record<string, ShoppingCheck>>;

/**
 * Stable key for a shopping line: the ingredient id when known, else the normalised name, plus
 * the unit, so "2 cups milk" and "1 l milk" can be ticked separately.
 */
export function shoppingLineKey(line: {
  ingredientId?: string | null;
  name: string;
  unit?: string | null;
}): string {
  const base = line.ingredientId || line.name.trim().toLowerCase().replace(/\s+/g, ' ');
  const unit = line.unit?.trim().toLowerCase();
  return (unit ? `${base}|${unit}` : base).slice(0, MAX_KEY_LENGTH);
}

const byCheckedAt = (a: ShoppingCheck, b: ShoppingCheck) =>
  a.checkedAt.localeCompare(b.checkedAt) || a.key.localeCompare(b.key);

/** Keeps the `max` most recent ticks. */
export function trimChecks(checks: Checks, max: number = MAX_SHOPPING_CHECKS): Checks {
  const all = Object.values(checks);
  if (all.length <= max) return checks;
  const keep = all.sort(byCheckedAt).slice(-max);
  return Object.fromEntries(keep.map((check) => [check.key, check]));
}

export function setChecked(checks: Checks, key: string, checked: boolean, at: string): Checks {
  if (!key || key.length > MAX_KEY_LENGTH) return checks;
  if (checked === !!checks[key]) return checks;
  if (checked) return trimChecks({ ...checks, [key]: { key, checkedAt: at } });
  const next = { ...checks };
  delete next[key];
  return next;
}

/** Unticks the given keys, or everything when `keys` is omitted. */
export function clearChecked(checks: Checks, keys?: readonly string[]): Checks {
  if (!keys) return Object.keys(checks).length === 0 ? checks : {};
  if (!keys.some((key) => key in checks)) return checks;
  const next = { ...checks };
  for (const key of keys) delete next[key];
  return next;
}

export interface ShoppingState {
  checked: Checks;
  setChecked: (key: string, checked: boolean, at?: string) => void;
  toggle: (key: string, at?: string) => void;
  clear: (keys?: readonly string[]) => void;
  reset: () => void;
}

export const useShoppingStore = create<ShoppingState>()(
  persist(
    (set, get) => {
      const commit = (next: Checks) => {
        if (next !== get().checked) set({ checked: next });
      };
      return {
        checked: {},
        setChecked: (key, checked, at = new Date().toISOString()) =>
          commit(setChecked(get().checked, key, checked, at)),
        toggle: (key, at = new Date().toISOString()) =>
          commit(setChecked(get().checked, key, !get().checked[key], at)),
        clear: (keys) => commit(clearChecked(get().checked, keys)),
        reset: () => set({ checked: {} }),
      };
    },
    versionedPersist({
      name: 'user.shopping',
      version: 1,
      schema: z.object({ checked: z.record(z.string(), shoppingCheckSchema) }),
      partialize: (state) => ({ checked: state.checked }),
    }),
  ),
);

export const selectIsChecked = (key: string) => (state: ShoppingState) => !!state.checked[key];

export const selectCheckedKeys = createSelector(
  (state: ShoppingState) => state.checked,
  (checked): ReadonlySet<string> => new Set(Object.keys(checked)),
);

export const shoppingSync = createCollectionAdapter({
  collection: 'shopping_checks',
  store: useShoppingStore,
  select: (state) => state.checked,
  schema: shoppingCheckSchema,
  // Merging another device's ticks can pass the cap; the engine deletes what is dropped remotely.
  apply: (state, changes) => ({ checked: trimChecks(applyToRecord(state.checked, changes)) }),
});
