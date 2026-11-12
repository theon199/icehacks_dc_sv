/**
 * Personal recipe variants: healthier versions of catalog recipes saved from a makeover. Synced as
 * the `variants` collection with one document per base recipe, holding its variants newest first,
 * so the recipe screen and the compare view can find them by the recipe they came from.
 *
 * Bounds keep every document well under the sync size limit: at most three variants per recipe,
 * each with clipped fields, and at most 300 recipes with variants (least recently changed go
 * first).
 */
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { readDataOwner } from '@/lib/sync/owner';

import { versionedPersist } from './persistence';
import { applyToRecord, createCollectionAdapter } from './syncAdapter';

export const MAX_VARIANTS_PER_RECIPE = 3;
export const MAX_VARIANT_RECIPES = 300;
export const MAX_VARIANT_INGREDIENTS = 60;
export const MAX_VARIANT_STEPS = 40;
export const MAX_VARIANT_SWAPS = 12;

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
  ingredients: z.array(z.string().min(1).max(200)).min(1).max(MAX_VARIANT_INGREDIENTS),
  steps: z.array(z.string().min(1).max(1000)).min(1).max(MAX_VARIANT_STEPS),
  swaps: z.array(variantSwapSchema).max(MAX_VARIANT_SWAPS),
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

const NO_GROUPS: VariantGroups = Object.freeze({});

/**
 * Version 1 copies carry the account they were saved under. Sign-out now wipes this store with the
 * other user stores, but a version 1 copy can predate that: keep it only when it belongs to the
 * account this device's data belongs to (or to none), never one left behind after a sign-out.
 */
export function upgradeVariantsV1(state: unknown, dataOwner: string | null): unknown {
  if (state == null || typeof state !== 'object') return state;
  const { owner, ...rest } = state as { owner?: unknown };
  if (typeof owner === 'string' && owner !== dataOwner) return { groups: {} };
  return rest;
}

export interface VariantState {
  groups: VariantGroups;
  save: (variant: RecipeVariant) => void;
  remove: (baseRecipeId: string, variantId: string, at?: string) => void;
  reset: () => void;
}

export const useVariantStore = create<VariantState>()(
  persist(
    (set, get) => {
      const commit = (next: VariantGroups) => {
        if (next !== get().groups) set({ groups: next });
      };
      return {
        groups: NO_GROUPS,
        save: (variant) => commit(addVariant(get().groups, variant)),
        remove: (baseRecipeId, variantId, at = new Date().toISOString()) =>
          commit(removeVariant(get().groups, baseRecipeId, variantId, at)),
        reset: () => set({ groups: NO_GROUPS }),
      };
    },
    versionedPersist({
      name: 'user.variants',
      version: 2,
      schema: z.object({ groups: z.record(z.string(), variantGroupSchema) }),
      migrations: { 1: (state) => upgradeVariantsV1(state, readDataOwner()) },
      partialize: (state) => ({ groups: state.groups }),
    }),
  ),
);

export const selectVariantGroups = (state: VariantState) => state.groups;

export const variantsSync = createCollectionAdapter({
  collection: 'variants',
  store: useVariantStore,
  select: (state) => state.groups,
  schema: variantGroupSchema,
  apply: (state, changes) => ({ groups: trimGroups(applyToRecord(state.groups, changes)) }),
});
