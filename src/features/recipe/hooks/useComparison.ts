/**
 * Resolves the two sides of a comparison. In order of preference:
 *   1. both ids given in the link (`from` is the original, `to` the adaptation);
 *   2. the person's own healthier version of `from`, when they have made one;
 *   3. another version of the same dish in the catalog, the less healthy one as the original.
 */
import { useMemo } from 'react';

import {
  useCandidates,
  useRecipe,
  useSubstitutions,
  type CandidateFilters,
  type RecipeDetail,
} from '@/lib/catalog';

import { usePersonalVariant } from '../deps';
import {
  diffIngredients,
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
    };

const NO_IDS: readonly string[] = [];

export function useComparison(fromId: string | undefined, toId: string | undefined) {
  const from = useRecipe(fromId ?? null);
  const variant = usePersonalVariant(toId ? undefined : fromId);
  const needFamily = !!from.data && !toId && !variant;
  const filters = useMemo<CandidateFilters>(
    () => ({ course: from.data?.course ?? 'main', limit: 2000 }),
    [from.data?.course],
  );
  const family = useCandidates(filters, { enabled: needFamily });
  const pair = useMemo(
    () => (needFamily && from.data && family.data ? pairFamily(from.data, family.data) : null),
    [needFamily, from.data, family.data],
  );
  const otherId =
    toId ?? (pair ? (pair.original.id === fromId ? pair.adapted.id : pair.original.id) : undefined);
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

  return useMemo((): ComparisonState => {
    if (!fromId) return { status: 'missing' };
    if (from.isError)
      return { status: 'error', error: from.error, retry: () => void from.refetch() };
    if (other.isError) {
      return { status: 'error', error: other.error, retry: () => void other.refetch() };
    }
    if (from.isPending) return { status: 'loading' };
    if (!from.data) return { status: 'missing' };
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
      };
    }
    const waiting = (otherId && other.isPending) || (needFamily && family.isPending);
    if (waiting) return { status: 'loading' };
    if (toId) return { status: 'missing' };
    return { status: 'alone', recipe: from.data };
  }, [fromId, toId, from, other, otherId, sides, subs.data, variant, needFamily, family.isPending]);
}
