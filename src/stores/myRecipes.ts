/**
 * The person's own recipes: family recipes, cards and links they brought in. Synced as the
 * `my_recipes` collection, one document per recipe.
 *
 * Each recipe keeps the safety result it was saved with and the lines the person checked
 * themselves. The stored result is a record, not a gate: screens and suggestions re-check every
 * recipe against the person's current allergens, diets and catalog data (fail-closed) before
 * showing it as safe.
 *
 * Bounds keep every document well under the sync size limit. Unlike generated data, these are the
 * person's own recipes, so nothing is dropped to make room: a full collection refuses new recipes.
 */
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { ALLERGEN_IDS, DIET_IDS } from '@/lib/catalog/types';

import { createSelector } from './memo';
import { versionedPersist } from './persistence';
import { applyToRecord, createCollectionAdapter } from './syncAdapter';

export const MAX_MY_RECIPES = 200;
export const MAX_MY_RECIPE_INGREDIENTS = 60;
export const MAX_MY_RECIPE_STEPS = 40;

export const MY_RECIPE_MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MyRecipeMeal = (typeof MY_RECIPE_MEALS)[number];

export const myRecipeIngredientSchema = z.object({
  /** The line as written, e.g. "1/3 cup cane vinegar". */
  text: z.string().trim().min(1).max(200),
  /** The plain ingredient, e.g. "cane vinegar". */
  name: z.string().trim().min(1).max(80),
  /** Catalog ingredient the name was matched to; null when Famara found none. */
  catalogIngredientId: z.string().min(1).max(80).nullable(),
});
export type MyRecipeIngredient = z.infer<typeof myRecipeIngredientSchema>;

export const myRecipeSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('link'), url: z.url({ protocol: /^https?$/ }).max(2000) }),
  z.object({ kind: z.literal('photo'), url: z.null() }),
  z.object({ kind: z.literal('text'), url: z.null() }),
]);
export type MyRecipeSource = z.infer<typeof myRecipeSourceSchema>;

export const MY_RECIPE_SAFETY_STATUSES = ['clear', 'needs_check', 'conflict'] as const;

/** The safety check as of `checkedAt`, against the allergens and diets declared then. */
export const myRecipeSafetySchema = z.object({
  status: z.enum(MY_RECIPE_SAFETY_STATUSES),
  allergens: z.array(z.enum(ALLERGEN_IDS)).max(ALLERGEN_IDS.length),
  diets: z.array(z.enum(DIET_IDS)).max(DIET_IDS.length),
  checkedAt: z.string(),
});
export type MyRecipeSafety = z.infer<typeof myRecipeSafetySchema>;

/** "I checked this" for one line, against the allergens and diets declared at the time. */
export const myRecipeConfirmationSchema = z.object({
  key: z.string().min(1).max(300),
  allergens: z.array(z.enum(ALLERGEN_IDS)).max(ALLERGEN_IDS.length),
  diets: z.array(z.enum(DIET_IDS)).max(DIET_IDS.length),
  at: z.string(),
});
export type MyRecipeConfirmation = z.infer<typeof myRecipeConfirmationSchema>;

export const myRecipeSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(160),
  servings: z.number().int().min(1).max(24),
  minutes: z.number().int().min(1).max(1440).nullable(),
  cuisine: z.string().trim().min(1).max(40).nullable(),
  meal: z.enum(MY_RECIPE_MEALS).nullable(),
  ingredients: z.array(myRecipeIngredientSchema).min(1).max(MAX_MY_RECIPE_INGREDIENTS),
  steps: z.array(z.string().trim().min(1).max(1000)).min(1).max(MAX_MY_RECIPE_STEPS),
  source: myRecipeSourceSchema,
  safety: myRecipeSafetySchema,
  confirmations: z.array(myRecipeConfirmationSchema).max(MAX_MY_RECIPE_INGREDIENTS),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MyRecipe = z.infer<typeof myRecipeSchema>;

export type MyRecipes = Readonly<Record<string, MyRecipe>>;

export type MyRecipeSaveResult = 'saved' | 'invalid' | 'full';

/**
 * Adds a recipe, or replaces the one with the same id. A recipe that fails validation, or a new
 * one beyond `max`, leaves the collection unchanged.
 */
export function saveMyRecipe(
  recipes: MyRecipes,
  recipe: MyRecipe,
  max: number = MAX_MY_RECIPES,
): { recipes: MyRecipes; result: MyRecipeSaveResult } {
  const parsed = myRecipeSchema.safeParse(recipe);
  if (!parsed.success) return { recipes, result: 'invalid' };
  if (!recipes[recipe.id] && Object.keys(recipes).length >= max) {
    return { recipes, result: 'full' };
  }
  return { recipes: { ...recipes, [recipe.id]: parsed.data }, result: 'saved' };
}

export type MyRecipePatch = Partial<Omit<MyRecipe, 'id' | 'createdAt' | 'updatedAt'>>;

/** Applies a patch and stamps `updatedAt`; an invalid result or unknown id changes nothing. */
export function updateMyRecipe(
  recipes: MyRecipes,
  id: string,
  patch: MyRecipePatch,
  at: string,
): MyRecipes {
  const current = recipes[id];
  if (!current) return recipes;
  const parsed = myRecipeSchema.safeParse({ ...current, ...patch, id, updatedAt: at });
  return parsed.success ? { ...recipes, [id]: parsed.data } : recipes;
}

export function removeMyRecipe(recipes: MyRecipes, id: string): MyRecipes {
  if (!recipes[id]) return recipes;
  const next = { ...recipes };
  delete next[id];
  return next;
}

export interface MyRecipesState {
  recipes: MyRecipes;
  save: (recipe: MyRecipe) => MyRecipeSaveResult;
  update: (id: string, patch: MyRecipePatch, at?: string) => void;
  remove: (id: string) => void;
  reset: () => void;
}

const NO_RECIPES: MyRecipes = Object.freeze({});

export const useMyRecipesStore = create<MyRecipesState>()(
  persist(
    (set, get) => {
      const commit = (next: MyRecipes) => {
        if (next !== get().recipes) set({ recipes: next });
      };
      return {
        recipes: NO_RECIPES,
        save: (recipe) => {
          const { recipes, result } = saveMyRecipe(get().recipes, recipe);
          commit(recipes);
          return result;
        },
        update: (id, patch, at = new Date().toISOString()) =>
          commit(updateMyRecipe(get().recipes, id, patch, at)),
        remove: (id) => commit(removeMyRecipe(get().recipes, id)),
        reset: () => set({ recipes: NO_RECIPES }),
      };
    },
    versionedPersist({
      name: 'user.myRecipes',
      version: 1,
      schema: z.object({ recipes: z.record(z.string(), myRecipeSchema) }),
      partialize: (state) => ({ recipes: state.recipes }),
    }),
  ),
);

/** Newest first. */
export const selectMyRecipeList = createSelector(
  (state: MyRecipesState) => state.recipes,
  (recipes) =>
    Object.values(recipes).sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
    ),
);

export const selectMyRecipeCount = (state: MyRecipesState) => Object.keys(state.recipes).length;

export const myRecipesSync = createCollectionAdapter({
  collection: 'my_recipes',
  store: useMyRecipesStore,
  select: (state) => state.recipes,
  schema: myRecipeSchema,
  // Remote recipes are never trimmed: they are the person's own, and dropping one here would be
  // pushed back as a deletion.
  apply: (state, changes) => ({ recipes: applyToRecord(state.recipes, changes) }),
});
