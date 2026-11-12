/**
 * The one seam between Make it healthier and modules it does not own.
 *
 * Variant storage: the synced saved-recipes store has no `variants` collection yet, so variants
 * live in this feature's own device store (`variantStore.ts`) behind the functions below. When the
 * collection lands, only this file changes.
 */
import { useCallback } from 'react';

import { useSessionStore } from '@/features/auth';

import type { RecipeVariant, VariantGroups } from './logic/variants';
import { selectOwnGroups, useVariantStore } from './variantStore';

export { AiGate, describeAiProblem, type AiProblem } from '@/features/chef';
export { aiApi } from '@/lib/api/ai';
export { useRecipe } from '@/lib/catalog';

/** The signed-in person's variant groups, keyed by base recipe id. */
export function useVariantGroups(): VariantGroups {
  const userId = useSessionStore((state) => state.userId);
  return useVariantStore(selectOwnGroups(userId));
}

/** Saves a variant for the signed-in person; false when nobody is signed in. */
export function useSaveVariant(): (variant: RecipeVariant) => boolean {
  const userId = useSessionStore((state) => state.userId);
  return useCallback(
    (variant: RecipeVariant) => {
      if (!userId) return false;
      useVariantStore.getState().save(userId, variant);
      return true;
    },
    [userId],
  );
}

export function useRemoveVariant(): (baseRecipeId: string, variantId: string) => void {
  const userId = useSessionStore((state) => state.userId);
  return useCallback(
    (baseRecipeId: string, variantId: string) => {
      if (userId) useVariantStore.getState().remove(userId, baseRecipeId, variantId);
    },
    [userId],
  );
}
