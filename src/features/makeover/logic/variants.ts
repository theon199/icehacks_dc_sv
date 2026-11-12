/**
 * Personal recipe variants made by Make it healthier. The variant documents, their bounds and
 * their state transitions live with the other synced user data in `src/stores` (collection
 * `variants`); this module re-exports them and adds the conversion from a makeover answer.
 */
import type { MakeoverResponse } from '@/lib/api/ai';
import {
  MAX_VARIANT_INGREDIENTS,
  MAX_VARIANT_STEPS,
  MAX_VARIANT_SWAPS,
  recipeVariantSchema,
  type RecipeVariant,
} from '@/stores';

export {
  MAX_VARIANT_RECIPES,
  MAX_VARIANTS_PER_RECIPE,
  addVariant,
  findVariant,
  recipeVariantSchema,
  removeVariant,
  trimGroups,
  variantGroupSchema,
  variantSwapSchema,
  type RecipeVariant,
  type VariantGroup,
  type VariantGroups,
  type VariantSwap,
} from '@/stores';

function clip(text: string, max: number): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function lines(values: readonly string[], max: number, count: number): string[] {
  return values
    .map((value) => clip(value, max))
    .filter(Boolean)
    .slice(0, count);
}

export interface VariantMeta {
  readonly id: string;
  readonly baseRecipeId: string;
  readonly goals: readonly string[];
  readonly request: string | null;
  readonly at: string;
}

/** A storable variant from a makeover answer, or null when the answer has nothing to keep. */
export function variantFromMakeover(
  makeover: Pick<
    MakeoverResponse,
    'title' | 'servings' | 'ingredients' | 'steps' | 'swaps' | 'note'
  >,
  meta: VariantMeta,
): RecipeVariant | null {
  const parsed = recipeVariantSchema.safeParse({
    id: meta.id,
    baseRecipeId: meta.baseRecipeId,
    title: clip(makeover.title, 160),
    servings: Math.min(24, Math.max(1, Math.round(makeover.servings))),
    goals: meta.goals.slice(0, 10),
    request: meta.request ? clip(meta.request, 300) || null : null,
    ingredients: lines(makeover.ingredients, 200, MAX_VARIANT_INGREDIENTS),
    steps: lines(makeover.steps, 1000, MAX_VARIANT_STEPS),
    swaps: makeover.swaps
      .map((swap) => ({
        from: clip(swap.from, 120),
        to: clip(swap.to, 120),
        why: clip(swap.why, 200),
      }))
      .filter((swap) => swap.from && swap.to)
      .slice(0, MAX_VARIANT_SWAPS),
    note: clip(makeover.note, 400),
    createdAt: meta.at,
  });
  return parsed.success ? parsed.data : null;
}
