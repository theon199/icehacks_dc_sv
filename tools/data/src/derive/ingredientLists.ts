import type { RecipeIngredientRow } from '../pipeline/types.ts';

export interface RecipeIngredientLists {
  /** Every matched ingredient id, once each, in line order. */
  ingredient_ids: string[];
  /** Matched ingredients on required lines that are not pantry staples, once each, in line order. */
  core_ingredient_ids: string[];
}

/**
 * The ingredient id lists the app reads for every candidate recipe. They are stored on the recipe
 * row so ranking queries read one column instead of aggregating `recipe_ingredients` per recipe.
 *
 * A core ingredient defines the dish: its line is matched, not optional, and its ingredient is not
 * a pantry staple (salt, oil, flour …). Pantry matching and dish similarity count only these, so a
 * jar of salt never makes a recipe look almost ready.
 */
export function recipeIngredientLists(
  lines: readonly Pick<RecipeIngredientRow, 'position' | 'ingredient_id' | 'optional'>[],
  isPantryStaple: (ingredientId: string) => boolean,
): RecipeIngredientLists {
  const all = new Set<string>();
  const core = new Set<string>();
  for (const line of [...lines].sort((a, b) => a.position - b.position)) {
    const id = line.ingredient_id;
    if (id === null) continue;
    all.add(id);
    if (line.optional === 0 && !isPantryStaple(id)) core.add(id);
  }
  return { ingredient_ids: [...all], core_ingredient_ids: [...core] };
}
