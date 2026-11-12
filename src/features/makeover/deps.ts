/**
 * The one seam between Make it healthier and modules it does not own. Saved variants are stored,
 * synced and wiped on sign-out by the `variants` store in `src/stores`.
 */
import { useCallback } from 'react';

import { selectVariantGroups, useVariantStore } from '@/stores';

import type { RecipeVariant, VariantGroups } from './logic/variants';

export { AiGate, describeAiProblem, type AiProblem } from '@/features/chef';
export { aiApi } from '@/lib/api/ai';
export { useRecipe } from '@/lib/catalog';

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
