/**
 * Saved recipe variants on this device.
 *
 * Variants belong in the synced saved-recipes store as its `variants` collection; until that
 * collection exists this store keeps them locally, with the same document shape (one group per
 * base recipe, see `logic/variants.ts`), so moving them is a matter of registering the collection.
 * Reach it only through `deps.ts`.
 *
 * Because this store is not part of the account-wide reset, it guards account boundaries itself:
 * variants are tagged with the account that saved them, are invisible to any other account and
 * are wiped when the person signs out.
 */
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { useSessionStore } from '@/features/auth';
import { versionedPersist } from '@/stores/persistence';

import {
  addVariant,
  removeVariant,
  variantGroupSchema,
  type RecipeVariant,
  type VariantGroups,
} from './logic/variants';

const EMPTY: VariantGroups = Object.freeze({});

export interface VariantState {
  /** Account the stored variants belong to. */
  ownerId: string | null;
  groups: VariantGroups;
  save: (ownerId: string, variant: RecipeVariant) => void;
  remove: (ownerId: string, baseRecipeId: string, variantId: string, at?: string) => void;
  reset: () => void;
}

export const useVariantStore = create<VariantState>()(
  persist(
    (set, get) => {
      /** The groups owned by `ownerId`; anything stored for another account is discarded. */
      const ownGroups = (ownerId: string) => (get().ownerId === ownerId ? get().groups : EMPTY);
      return {
        ownerId: null,
        groups: EMPTY,
        save: (ownerId, variant) => {
          const current = ownGroups(ownerId);
          const next = addVariant(current, variant);
          if (next !== current || get().ownerId !== ownerId) set({ ownerId, groups: next });
        },
        remove: (ownerId, baseRecipeId, variantId, at = new Date().toISOString()) => {
          const current = ownGroups(ownerId);
          const next = removeVariant(current, baseRecipeId, variantId, at);
          if (next !== current) set({ ownerId, groups: next });
        },
        reset: () => set({ ownerId: null, groups: EMPTY }),
      };
    },
    versionedPersist({
      name: 'user.variants',
      version: 1,
      schema: z.object({
        ownerId: z.string().nullable(),
        groups: z.record(z.string(), variantGroupSchema),
      }),
      partialize: (state) => ({ ownerId: state.ownerId, groups: state.groups }),
    }),
  ),
);

/** Variant groups of the signed-in account (empty for anyone else). */
export function selectOwnGroups(ownerId: string | null) {
  return (state: VariantState): VariantGroups =>
    ownerId != null && state.ownerId === ownerId ? state.groups : EMPTY;
}

// Signing out wipes the device copy, like every other per-account store.
useSessionStore.subscribe((session, previous) => {
  if (previous.userId != null && session.userId !== previous.userId) {
    useVariantStore.getState().reset();
    useVariantStore.persist.clearStorage();
  }
});
