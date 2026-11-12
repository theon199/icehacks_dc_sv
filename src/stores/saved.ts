/**
 * Saved recipes (the Cookbook). One synced document per recipe, keyed by recipe id.
 */
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { createSelector } from './memo';
import { versionedPersist } from './persistence';
import { applyToRecord, createCollectionAdapter } from './syncAdapter';

export const MAX_SAVED = 2000;

export const savedRecipeSchema = z.object({
  recipeId: z.string().min(1).max(128),
  savedAt: z.string(),
});
export type SavedRecipe = z.infer<typeof savedRecipeSchema>;

type Saved = Readonly<Record<string, SavedRecipe>>;

export function saveRecipe(saved: Saved, recipeId: string, at: string): Saved {
  if (saved[recipeId] || !recipeId || recipeId.length > 128) return saved;
  if (Object.keys(saved).length >= MAX_SAVED) return saved;
  return { ...saved, [recipeId]: { recipeId, savedAt: at } };
}

export function unsaveRecipe(saved: Saved, recipeId: string): Saved {
  if (!saved[recipeId]) return saved;
  const next = { ...saved };
  delete next[recipeId];
  return next;
}

export interface SavedState {
  saved: Saved;
  save: (recipeId: string, at?: string) => void;
  unsave: (recipeId: string) => void;
  /** Returns whether the recipe is saved afterwards. */
  toggle: (recipeId: string, at?: string) => boolean;
  reset: () => void;
}

export const useSavedStore = create<SavedState>()(
  persist(
    (set, get) => ({
      saved: {},
      save: (recipeId, at = new Date().toISOString()) => {
        const next = saveRecipe(get().saved, recipeId, at);
        if (next !== get().saved) set({ saved: next });
      },
      unsave: (recipeId) => {
        const next = unsaveRecipe(get().saved, recipeId);
        if (next !== get().saved) set({ saved: next });
      },
      toggle: (recipeId, at = new Date().toISOString()) => {
        const { saved } = get();
        const next = saved[recipeId]
          ? unsaveRecipe(saved, recipeId)
          : saveRecipe(saved, recipeId, at);
        if (next !== saved) set({ saved: next });
        return !!next[recipeId];
      },
      reset: () => set({ saved: {} }),
    }),
    versionedPersist({
      name: 'user.saved',
      version: 1,
      schema: z.object({ saved: z.record(z.string(), savedRecipeSchema) }),
      partialize: (state) => ({ saved: state.saved }),
    }),
  ),
);

/** Saved recipe ids, most recently saved first. */
export const selectSavedIds = createSelector(
  (state: SavedState) => state.saved,
  (saved) =>
    Object.values(saved)
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt) || a.recipeId.localeCompare(b.recipeId))
      .map((entry) => entry.recipeId),
);

export const selectIsSaved = (recipeId: string) => (state: SavedState) => !!state.saved[recipeId];
export const selectSavedCount = (state: SavedState) => Object.keys(state.saved).length;

export const savedSync = createCollectionAdapter({
  collection: 'saved_recipes',
  store: useSavedStore,
  select: (state) => state.saved,
  schema: savedRecipeSchema,
  apply: (state, changes) => ({ saved: applyToRecord(state.saved, changes) }),
});
