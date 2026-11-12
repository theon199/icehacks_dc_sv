/**
 * The recipe screens' only doorway to other features. Each export is either the sibling feature's
 * public surface or, while that feature is still being built, a neutral stand-in with the same
 * shape (renders nothing, returns null). Swapping a stand-in for the real thing is a one-line
 * change here; nothing else in the recipe feature needs to know.
 */
import { useMemo } from 'react';

import { selectAge, selectCanUseAi, useSessionStore } from '@/features/auth';
import { findVariant, useVariantGroups } from '@/features/makeover';

import { sideFromPersonalVersion, type CompareSide } from './model/compare';

/** Estimated grocery cost of a recipe (`recipeId`, optional `servings`). */
export { CostSummary } from '@/features/grocery';

/** Whether AI features may open for this person (18+ and agreed to the AI terms). */
export function useCanUseAi(): boolean {
  return useSessionStore((state) => selectCanUseAi(state));
}

/** The person's age in years, for nutrient targets; null when unknown. */
export function useAge(): number | null {
  return useSessionStore((state) => selectAge(state));
}

/**
 * The person's own healthier version of a recipe, made with "Make it healthier" and kept by that
 * feature. With a `variantId` (the link from a saved makeover) that exact version; without one,
 * their newest version of the recipe. Null when there is none.
 */
export function usePersonalVariant(
  recipeId: string | undefined,
  variantId: string | undefined,
): CompareSide | null {
  const groups = useVariantGroups();
  return useMemo(() => {
    if (!recipeId) return null;
    const version = variantId
      ? findVariant(groups, recipeId, variantId)
      : (groups[recipeId]?.variants[0] ?? null);
    return version ? sideFromPersonalVersion(version) : null;
  }, [groups, recipeId, variantId]);
}
