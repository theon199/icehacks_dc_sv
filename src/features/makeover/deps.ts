/**
 * The one seam between Make it healthier and modules it does not own.
 *
 * Variant storage: the saved-recipes store in `src/stores` has no `variants` collection yet, so
 * this feature keeps one itself (`variantStore.ts`, synced as `variants`, one document per base
 * recipe). When the collection moves into the stores layer, only this file changes.
 */
import { useCallback } from 'react';

import { useSessionStore } from '@/features/auth';

import type { RecipeVariant, VariantGroups } from './logic/variants';
import { selectVariantGroups, useVariantStore } from './variantStore';

export { AiGate, describeAiProblem, type AiProblem } from '@/features/chef';
export { aiApi } from '@/lib/api/ai';
export { useRecipe } from '@/lib/catalog';

/** Ties the stored variants to the signed-in account (see `variantStore.ts`). */
function claimVariants(): void {
  const { userId } = useSessionStore.getState();
  if (userId) useVariantStore.getState().claim(userId);
}

useSessionStore.subscribe((state, previous) => {
  if (state.userId !== previous.userId) claimVariants();
});
if (useVariantStore.persist.hasHydrated()) claimVariants();
else useVariantStore.persist.onFinishHydration(claimVariants);

/** Variant groups of the signed-in person, keyed by base recipe id. */
export function useVariantGroups(): VariantGroups {
  return useVariantStore(selectVariantGroups);
}

export function useSaveVariant(): (variant: RecipeVariant) => void {
  return useCallback((variant: RecipeVariant) => useVariantStore.getState().save(variant), []);
}

export function useRemoveVariant(): (baseRecipeId: string, variantId: string) => void {
  return useCallback(
    (baseRecipeId: string, variantId: string) =>
      useVariantStore.getState().remove(baseRecipeId, variantId),
    [],
  );
}
