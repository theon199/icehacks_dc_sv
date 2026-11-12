/**
 * Saved recipe variants, synced as the `variants` collection: one document per base recipe,
 * holding its variants newest first (see `logic/variants.ts`).
 *
 * The collection belongs next to the saved recipes in `src/stores`; until it moves there it lives
 * here and registers itself with sync like every other per-account store, so it is mirrored to
 * the account and wiped on sign-out. Reach it only through `deps.ts`.
 */
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { registerSyncedStore } from '@/lib/sync/registry';
import { versionedPersist } from '@/stores/persistence';
import { applyToRecord, createCollectionAdapter } from '@/stores/syncAdapter';

import {
  addVariant,
  removeVariant,
  trimGroups,
  variantGroupSchema,
  type RecipeVariant,
  type VariantGroups,
} from './logic/variants';

const EMPTY: VariantGroups = Object.freeze({});

export interface VariantState {
  groups: VariantGroups;
  save: (variant: RecipeVariant) => void;
  remove: (baseRecipeId: string, variantId: string, at?: string) => void;
  reset: () => void;
}

export const useVariantStore = create<VariantState>()(
  persist(
    (set, get) => {
      const commit = (next: VariantGroups) => {
        if (next !== get().groups) set({ groups: next });
      };
      return {
        groups: EMPTY,
        save: (variant) => commit(addVariant(get().groups, variant)),
        remove: (baseRecipeId, variantId, at = new Date().toISOString()) =>
          commit(removeVariant(get().groups, baseRecipeId, variantId, at)),
        reset: () => set({ groups: EMPTY }),
      };
    },
    versionedPersist({
      name: 'user.variants',
      version: 1,
      schema: z.object({ groups: z.record(z.string(), variantGroupSchema) }),
      partialize: (state) => ({ groups: state.groups }),
    }),
  ),
);

export const selectVariantGroups = (state: VariantState) => state.groups;

export const variantsSync = createCollectionAdapter({
  collection: 'variants',
  store: useVariantStore,
  select: (state) => state.groups,
  schema: variantGroupSchema,
  apply: (state, changes) => ({ groups: trimGroups(applyToRecord(state.groups, changes)) }),
});

registerSyncedStore({
  adapter: variantsSync,
  reset: () => {
    useVariantStore.getState().reset();
    useVariantStore.persist.clearStorage();
  },
});
