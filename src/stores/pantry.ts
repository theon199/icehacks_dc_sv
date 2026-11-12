/**
 * What the person has at home. One synced document per pantry item.
 */
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { INGREDIENT_CATEGORIES, type IngredientCategory } from '@/lib/catalog/types';
import { newId } from '@/lib/id';

import { createSelector } from './memo';
import { versionedPersist } from './persistence';
import { applyToRecord, createCollectionAdapter } from './syncAdapter';

export const MAX_PANTRY_ITEMS = 500;

export const pantryItemSchema = z.object({
  id: z.string().min(1).max(64),
  /** Catalog ingredient id when the item was matched; null for free-text items. */
  ingredientId: z.string().min(1).max(64).nullable(),
  name: z.string().trim().min(1).max(80),
  qty: z.number().positive().max(1_000_000).nullable(),
  unit: z.string().trim().min(1).max(24).nullable(),
  category: z.enum(INGREDIENT_CATEGORIES),
  addedAt: z.string(),
  expiresAt: z.string().nullable(),
});
export type PantryItem = z.infer<typeof pantryItemSchema>;

export interface NewPantryItem {
  ingredientId?: string | null;
  name: string;
  qty?: number | null;
  unit?: string | null;
  category?: IngredientCategory;
  expiresAt?: string | null;
}

type Items = Readonly<Record<string, PantryItem>>;

const normalizeName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

function sameThing(item: PantryItem, input: NewPantryItem): boolean {
  if (input.ingredientId && item.ingredientId) return item.ingredientId === input.ingredientId;
  return normalizeName(item.name) === normalizeName(input.name);
}

/**
 * Adds an item, or tops up an existing one for the same ingredient and unit (quantities add up;
 * an unknown quantity stays unknown). Invalid input and a full pantry leave `items` unchanged.
 */
export function addPantryItem(
  items: Items,
  input: NewPantryItem,
  meta: { id: string; at: string },
): Items {
  const unit = input.unit?.trim() || null;
  const existing = Object.values(items).find(
    (item) => sameThing(item, input) && (item.unit ?? null) === unit,
  );
  if (existing) {
    const qty = existing.qty != null && input.qty != null ? existing.qty + input.qty : existing.qty;
    return updatePantryItem(items, existing.id, {
      qty,
      expiresAt: input.expiresAt ?? existing.expiresAt,
    });
  }
  if (Object.keys(items).length >= MAX_PANTRY_ITEMS) return items;
  const parsed = pantryItemSchema.safeParse({
    id: meta.id,
    ingredientId: input.ingredientId ?? null,
    name: input.name,
    qty: input.qty ?? null,
    unit,
    category: input.category ?? 'other',
    addedAt: meta.at,
    expiresAt: input.expiresAt ?? null,
  });
  return parsed.success ? { ...items, [meta.id]: parsed.data } : items;
}

export function updatePantryItem(
  items: Items,
  id: string,
  patch: Partial<Omit<PantryItem, 'id' | 'addedAt'>>,
): Items {
  const current = items[id];
  if (!current) return items;
  const parsed = pantryItemSchema.safeParse({ ...current, ...patch, id, addedAt: current.addedAt });
  if (!parsed.success) return items;
  const next = parsed.data;
  const same = (Object.keys(next) as (keyof PantryItem)[]).every(
    (key) => next[key] === current[key],
  );
  return same ? items : { ...items, [id]: next };
}

export function removePantryItems(items: Items, ids: readonly string[]): Items {
  if (!ids.some((id) => id in items)) return items;
  const next = { ...items };
  for (const id of ids) delete next[id];
  return next;
}

export interface PantryState {
  items: Items;
  add: (input: NewPantryItem, at?: string) => void;
  addMany: (inputs: readonly NewPantryItem[], at?: string) => void;
  update: (id: string, patch: Partial<Omit<PantryItem, 'id' | 'addedAt'>>) => void;
  remove: (id: string) => void;
  removeMany: (ids: readonly string[]) => void;
  reset: () => void;
}

export const usePantryStore = create<PantryState>()(
  persist(
    (set, get) => {
      const commit = (next: Items) => {
        if (next !== get().items) set({ items: next });
      };
      return {
        items: {},
        add: (input, at = new Date().toISOString()) =>
          commit(addPantryItem(get().items, input, { id: newId(), at })),
        addMany: (inputs, at = new Date().toISOString()) =>
          commit(
            inputs.reduce<Items>(
              (items, input) => addPantryItem(items, input, { id: newId(), at }),
              get().items,
            ),
          ),
        update: (id, patch) => commit(updatePantryItem(get().items, id, patch)),
        remove: (id) => commit(removePantryItems(get().items, [id])),
        removeMany: (ids) => commit(removePantryItems(get().items, ids)),
        reset: () => set({ items: {} }),
      };
    },
    versionedPersist({
      name: 'user.pantry',
      version: 1,
      schema: z.object({ items: z.record(z.string(), pantryItemSchema) }),
      partialize: (state) => ({ items: state.items }),
    }),
  ),
);

const categoryOrder = new Map(INGREDIENT_CATEGORIES.map((category, index) => [category, index]));

/** Items by shelf (category order), then by name. */
export const selectPantryItems = createSelector(
  (state: PantryState) => state.items,
  (items) =>
    Object.values(items).sort(
      (a, b) =>
        (categoryOrder.get(a.category) ?? 99) - (categoryOrder.get(b.category) ?? 99) ||
        a.name.localeCompare(b.name),
    ),
);

export const selectPantryShelves = createSelector(selectPantryItems, (items) => {
  const shelves = new Map<IngredientCategory, PantryItem[]>();
  for (const item of items) {
    const shelf = shelves.get(item.category) ?? [];
    shelf.push(item);
    shelves.set(item.category, shelf);
  }
  return [...shelves.entries()].map(([category, shelfItems]) => ({ category, items: shelfItems }));
});

/** Catalog ingredient ids on hand, for pantry matching. */
export const selectPantryIngredientIds = createSelector(
  (state: PantryState) => state.items,
  (items): ReadonlySet<string> =>
    new Set(
      Object.values(items)
        .map((item) => item.ingredientId)
        .filter((id): id is string => id != null),
    ),
);

export const selectPantryCount = (state: PantryState) => Object.keys(state.items).length;

export const pantrySync = createCollectionAdapter({
  collection: 'pantry',
  store: usePantryStore,
  select: (state) => state.items,
  schema: pantryItemSchema,
  apply: (state, changes) => ({ items: applyToRecord(state.items, changes) }),
});
