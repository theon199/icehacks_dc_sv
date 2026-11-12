/**
 * Personal recipe variants: healthier versions of catalog recipes that someone saved from a
 * makeover. One document per base recipe holds its variants, newest first, so the recipe screen
 * and the compare view can find them by the recipe they came from.
 *
 * Bounds keep every document well under the sync size limit: at most three variants per recipe,
 * each within the makeover function's own limits, and at most 300 recipes with variants.
 */
import { z } from 'zod';

import type { MakeoverResponse } from '@/lib/api/ai';

export const MAX_VARIANTS_PER_RECIPE = 3;
export const MAX_VARIANT_RECIPES = 300;
const MAX_INGREDIENTS = 60;
const MAX_STEPS = 40;
const MAX_SWAPS = 12;

export const variantSwapSchema = z.object({
  from: z.string().min(1).max(120),
  to: z.string().min(1).max(120),
  why: z.string().max(200),
});
export type VariantSwap = z.infer<typeof variantSwapSchema>;

export const recipeVariantSchema = z.object({
  id: z.string().min(1).max(64),
  baseRecipeId: z.string().min(1).max(128),
  title: z.string().min(1).max(160),
  servings: z.number().int().min(1).max(24),
  /** Goals the makeover aimed for, as preference goal ids. */
  goals: z.array(z.string().min(1).max(40)).max(10),
  request: z.string().max(300).nullable(),
  ingredients: z.array(z.string().min(1).max(200)).min(1).max(MAX_INGREDIENTS),
  steps: z.array(z.string().min(1).max(1000)).min(1).max(MAX_STEPS),
  swaps: z.array(variantSwapSchema).max(MAX_SWAPS),
  note: z.string().max(400),
  createdAt: z.string(),
});
export type RecipeVariant = z.infer<typeof recipeVariantSchema>;

export const variantGroupSchema = z.object({
  baseRecipeId: z.string().min(1).max(128),
  updatedAt: z.string(),
  variants: z.array(recipeVariantSchema).min(1).max(MAX_VARIANTS_PER_RECIPE),
});
export type VariantGroup = z.infer<typeof variantGroupSchema>;

export type VariantGroups = Readonly<Record<string, VariantGroup>>;

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
    ingredients: lines(makeover.ingredients, 200, MAX_INGREDIENTS),
    steps: lines(makeover.steps, 1000, MAX_STEPS),
    swaps: makeover.swaps
      .map((swap) => ({
        from: clip(swap.from, 120),
        to: clip(swap.to, 120),
        why: clip(swap.why, 200),
      }))
      .filter((swap) => swap.from && swap.to)
      .slice(0, MAX_SWAPS),
    note: clip(makeover.note, 400),
    createdAt: meta.at,
  });
  return parsed.success ? parsed.data : null;
}

/** Keeps the recipes whose variants changed most recently. */
export function trimGroups(
  groups: VariantGroups,
  max: number = MAX_VARIANT_RECIPES,
): VariantGroups {
  const all = Object.values(groups);
  if (all.length <= max) return groups;
  const keep = all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, max);
  return Object.fromEntries(keep.map((group) => [group.baseRecipeId, group]));
}

/** Adds a variant as the newest for its recipe; the oldest beyond the cap is dropped. */
export function addVariant(groups: VariantGroups, variant: RecipeVariant): VariantGroups {
  const existing = groups[variant.baseRecipeId];
  if (existing?.variants.some((v) => v.id === variant.id)) return groups;
  const variants = [variant, ...(existing?.variants ?? [])].slice(0, MAX_VARIANTS_PER_RECIPE);
  const updatedAt =
    existing && existing.updatedAt > variant.createdAt ? existing.updatedAt : variant.createdAt;
  return trimGroups({
    ...groups,
    [variant.baseRecipeId]: { baseRecipeId: variant.baseRecipeId, updatedAt, variants },
  });
}

export function removeVariant(
  groups: VariantGroups,
  baseRecipeId: string,
  variantId: string,
  at: string,
): VariantGroups {
  const group = groups[baseRecipeId];
  if (!group?.variants.some((v) => v.id === variantId)) return groups;
  const variants = group.variants.filter((v) => v.id !== variantId);
  const next = { ...groups };
  if (variants.length === 0) delete next[baseRecipeId];
  else next[baseRecipeId] = { ...group, variants, updatedAt: at };
  return next;
}

export function findVariant(
  groups: VariantGroups,
  baseRecipeId: string,
  variantId: string,
): RecipeVariant | null {
  return groups[baseRecipeId]?.variants.find((v) => v.id === variantId) ?? null;
}
