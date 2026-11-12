/**
 * Resolves the two sides of a comparison. In order of preference:
 *   1. both ids given in the link (`from` is the original, `to` the adaptation), where `to` is
 *      one of the person's own versions of `from` or else a catalog recipe;
 *   2. the person's newest own healthier version of `from`, when they have made one;
 *   3. another version of the same dish in the catalog, the less healthy one as the original.
 *      Only versions that clear the person's allergens and diets are picked here.
 *
 * Whichever way the healthier version was found, it is checked against the person's allergens and
 * diets, and the verdict travels with the comparison so the screen can warn.
 */
import { useMemo } from 'react';

import type { SafetyVerdict } from '@/domain';
import { useRecipe, useRecipeFamily, useSubstitutions, type RecipeDetail } from '@/lib/catalog';

import { useDomainPreferences } from './usePersonalContext';
import { usePersonalVariant } from '../deps';
import {
  adaptedSafety,
  diffIngredients,
  familySafetyFilters,
  nutritionDeltas,
  pairFamily,
  sideFromRecipe,
  summariseComparison,
  type CompareSide,
  type CompareSummary,
  type DiffEntry,
  type NutritionDelta,
} from '../model/compare';

export type ComparisonState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: unknown; readonly retry: () => void }
  | { readonly status: 'missing' }
  | { readonly status: 'alone'; readonly recipe: RecipeDetail }
  | {
      readonly status: 'ready';
      readonly original: CompareSide;
      readonly adapted: CompareSide;
      readonly personal: boolean;
      readonly diff: readonly DiffEntry[];
      readonly deltas: readonly NutritionDelta[];
      readonly summary: CompareSummary;
      /** The healthier version checked against the person's allergens and diets. */
      readonly safety: SafetyVerdict;
    };

const NO_IDS: readonly string[] = [];

export function useComparison(fromId: string | undefined, toId: string | undefined) {
  const from = useRecipe(fromId ?? null);
  // A `to` id may name one of the person's own versions (the link from a saved makeover).
  const variant = usePersonalVariant(fromId, toId);
  const needFamily = !!from.data && !toId && !variant;
  const prefs = useDomainPreferences();
  const allergens = prefs.allergens;
  const diets = prefs.diets;
  const filters = useMemo(() => familySafetyFilters({ allergens, diets }), [allergens, diets]);
  // Only this dish's versions are read, already screened by the catalog's fail-closed filters.
  const family = useRecipeFamily(from.data?.familyId, filters, { enabled: needFamily });
  const pair = useMemo(
    () => (needFamily && from.data && family.data ? pairFamily(from.data, family.data) : null),
    [needFamily, from.data, family.data],
  );
  const otherId = variant
    ? undefined
    : (toId ??
      (pair ? (pair.original.id === fromId ? pair.adapted.id : pair.original.id) : undefined));
  const other = useRecipe(otherId ?? null);

  const sides = useMemo((): { original: CompareSide; adapted: CompareSide } | null => {
    if (!from.data) return null;
    if (variant) return { original: sideFromRecipe(from.data), adapted: variant };
    if (!other.data) return null;
    const a = sideFromRecipe(from.data);
    const b = sideFromRecipe(other.data);
    if (toId) return { original: a, adapted: b };
    return pair?.original.id === from.data.id
      ? { original: a, adapted: b }
      : { original: b, adapted: a };
  }, [from.data, other.data, variant, toId, pair]);

  const originalIds = useMemo(() => {
    if (!sides) return NO_IDS;
    const ids = new Set<string>();
    for (const line of sides.original.lines) if (line.ingredientId) ids.add(line.ingredientId);
    return [...ids].sort();
  }, [sides]);
  const subs = useSubstitutions(originalIds);

  const fromData = from.data;
  const fromPending = from.isPending;
  const fromError = from.isError ? from.error : null;
  const refetchFrom = from.refetch;
  const otherPending = other.isPending;
  const otherError = other.isError ? other.error : null;
  const refetchOther = other.refetch;
  const familyPending = family.isPending;

  return useMemo((): ComparisonState => {
    if (!fromId) return { status: 'missing' };
    if (fromError !== null) {
      return { status: 'error', error: fromError, retry: () => void refetchFrom() };
    }
    if (otherError !== null) {
      return { status: 'error', error: otherError, retry: () => void refetchOther() };
    }
    if (fromPending) return { status: 'loading' };
    if (!fromData) return { status: 'missing' };
    if (sides) {
      const diff = diffIngredients(sides.original, sides.adapted, subs.data ?? []);
      const deltas = nutritionDeltas(sides.original.nutrition, sides.adapted.nutrition);
      return {
        status: 'ready',
        ...sides,
        personal: !!variant,
        diff,
        deltas,
        summary: summariseComparison(diff, deltas),
        safety: adaptedSafety(sides.adapted, { allergens, diets }),
      };
    }
    const waiting = (otherId && otherPending) || (needFamily && familyPending);
    if (waiting) return { status: 'loading' };
    if (toId) return { status: 'missing' };
    return { status: 'alone', recipe: fromData };
  }, [
    fromId,
    toId,
    fromData,
    fromPending,
    fromError,
    refetchFrom,
    otherPending,
    otherError,
    refetchOther,
    otherId,
    sides,
    subs.data,
    variant,
    needFamily,
    familyPending,
    allergens,
    diets,
  ]);
}
