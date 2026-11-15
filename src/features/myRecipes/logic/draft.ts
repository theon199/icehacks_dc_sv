/**
 * The editable copy of an imported recipe on the Review screen, and how it becomes a saved
 * recipe. Pure: ids, times and catalog matches are passed in.
 */
import type { IngredientConfirmation } from '@/domain/ownRecipes';
import type { ImportedRecipe, RecipeImportRequest } from '@/lib/api/ai';
import {
  MAX_MY_RECIPE_INGREDIENTS,
  MAX_MY_RECIPE_STEPS,
  myRecipeSourceSchema,
  type MyRecipe,
  type MyRecipeMeal,
  type MyRecipeSafety,
  type MyRecipeSource,
} from '@/stores';

/** Lines the editor lets someone add, up to what a saved recipe can hold. */
export const MAX_INGREDIENT_LINES = MAX_MY_RECIPE_INGREDIENTS;
export const MAX_STEP_LINES = MAX_MY_RECIPE_STEPS;

export interface DraftLine {
  /** Stable key for list rendering and editing; not stored. */
  readonly key: string;
  readonly text: string;
}

export interface DraftIngredient extends DraftLine {
  readonly name: string;
}

export interface RecipeDraft {
  readonly title: string;
  readonly servings: number;
  readonly minutes: number | null;
  readonly cuisine: string | null;
  readonly meal: MyRecipeMeal | null;
  readonly ingredients: readonly DraftIngredient[];
  readonly steps: readonly DraftLine[];
  readonly source: MyRecipeSource;
}

/** Where the recipe came from: the page it was read from for links, nothing else otherwise. */
export function sourceFor(request: RecipeImportRequest, recipe: ImportedRecipe): MyRecipeSource {
  if (request.source !== 'link') return { kind: request.source, url: null };
  const link = myRecipeSourceSchema.safeParse({
    kind: 'link',
    url: recipe.source_url ?? request.url,
  });
  return link.success ? link.data : { kind: 'text', url: null };
}

export function draftFromImport(recipe: ImportedRecipe, source: MyRecipeSource): RecipeDraft {
  return {
    title: recipe.title,
    servings: recipe.servings,
    minutes: recipe.total_minutes,
    cuisine: recipe.cuisine,
    meal: recipe.meal,
    ingredients: recipe.ingredients.map((line, index) => ({
      key: `i${index}`,
      text: line.text,
      name: line.name,
    })),
    steps: recipe.steps.map((text, index) => ({ key: `s${index}`, text })),
    source,
  };
}

/** The ingredient lines with any blank ones left out, as safety and saving read them. */
export function filledIngredients(draft: RecipeDraft): DraftIngredient[] {
  return draft.ingredients
    .map((line) => ({ ...line, text: line.text.trim(), name: line.name.trim() }))
    .filter((line) => line.text !== '' && line.name !== '');
}

/** What stops the draft from being saved, or null when it can be. */
export function draftProblem(draft: RecipeDraft): string | null {
  if (draft.title.trim() === '') return 'Give the recipe a name.';
  if (!Number.isInteger(draft.servings) || draft.servings < 1 || draft.servings > 24) {
    return 'Servings must be between 1 and 24.';
  }
  if (draft.minutes !== null && (draft.minutes < 1 || draft.minutes > 1440)) {
    return 'Time must be between 1 minute and 24 hours.';
  }
  const ingredients = filledIngredients(draft);
  if (ingredients.length === 0) return 'Add at least one ingredient.';
  if (ingredients.length > MAX_MY_RECIPE_INGREDIENTS) {
    return `A recipe can have up to ${MAX_MY_RECIPE_INGREDIENTS} ingredients.`;
  }
  const steps = draft.steps.filter((step) => step.text.trim() !== '');
  if (steps.length === 0) return 'Add at least one step.';
  if (steps.length > MAX_MY_RECIPE_STEPS) {
    return `A recipe can have up to ${MAX_MY_RECIPE_STEPS} steps.`;
  }
  return null;
}

export interface SaveDetails {
  id: string;
  at: string;
  /** Catalog ingredient for a plain name, or null when there is no safe match. */
  catalogIdFor: (name: string) => string | null;
  safety: MyRecipeSafety;
  confirmations: readonly IngredientConfirmation[];
}

/** Confirmations in the stored shape. */
export function storedConfirmations(
  confirmations: readonly IngredientConfirmation[],
): MyRecipe['confirmations'] {
  return confirmations.map((confirmation) => ({
    key: confirmation.key,
    allergens: [...confirmation.allergens],
    diets: [...confirmation.diets],
    at: confirmation.at,
  }));
}

export function toMyRecipe(draft: RecipeDraft, details: SaveDetails): MyRecipe {
  const cuisine = draft.cuisine?.trim() ?? '';
  return {
    id: details.id,
    title: draft.title.trim(),
    servings: draft.servings,
    minutes: draft.minutes,
    cuisine: cuisine === '' ? null : cuisine,
    meal: draft.meal,
    ingredients: filledIngredients(draft).map((line) => ({
      text: line.text,
      name: line.name,
      catalogIngredientId: details.catalogIdFor(line.name),
    })),
    steps: draft.steps.map((step) => step.text.trim()).filter((text) => text !== ''),
    source: draft.source,
    safety: details.safety,
    confirmations: storedConfirmations(details.confirmations),
    createdAt: details.at,
    updatedAt: details.at,
  };
}
