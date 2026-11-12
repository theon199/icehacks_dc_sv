/**
 * Turns the plan for a range of days into a shopping list: catalog recipes and ingredients and the
 * pantry are reshaped into the domain's inputs, the domain merges and subtracts, and the result is
 * grouped into aisles in store-walk order.
 */
import {
  buildShoppingList,
  groupByAisle,
  type AisleGroup,
  type PantryEntry,
  type ShoppingIngredient,
  type ShoppingItem,
  type ShoppingRecipe,
} from '@/domain/shopping';
import type { Ingredient, RecipeIngredientLine } from '@/lib/catalog';
import type { PantryItem } from '@/stores/pantry';

import { arrangeAisles } from './aisles';
import { subtractFreeTextPantry } from './freeText';
import type { PlannedMealRef } from './planRange';

/** The parts of a catalog recipe the list needs. */
export interface ListRecipe {
  readonly id: string;
  readonly servings: number;
  readonly ingredients: readonly RecipeIngredientLine[];
}

export interface PlannedListInput {
  readonly meals: readonly PlannedMealRef[];
  readonly recipes: ReadonlyMap<string, ListRecipe>;
  readonly ingredients: readonly Ingredient[];
  readonly pantry: readonly PantryItem[];
  /**
   * Size of each breakfast, lunch and dinner serving: 0.5 in small appetite mode, otherwise 1.
   * Snacks are always planned as full portions, so they are never scaled by this.
   */
  readonly portion: number;
}

export interface PlannedList {
  /** Items still to buy, by aisle. */
  readonly groups: readonly AisleGroup[];
  readonly items: readonly ShoppingItem[];
  /** Items the pantry fully covers. */
  readonly inPantry: readonly ShoppingItem[];
  /** Planned meals whose recipe was found and counted. */
  readonly mealCount: number;
  /** Planned recipe ids the catalog no longer has. */
  readonly missingRecipeIds: readonly string[];
  /** Catalog details of every ingredient on the list, for shelving bought items. */
  readonly ingredientsById: ReadonlyMap<string, Ingredient>;
}

function toShoppingIngredient(ingredient: Ingredient): ShoppingIngredient {
  return {
    id: ingredient.id,
    name: ingredient.name,
    plural: ingredient.plural,
    aisle: ingredient.aisle,
    pantry_staple: ingredient.pantryStaple,
    grams_per_unit: ingredient.gramsPerUnit,
  };
}

/**
 * Pantry items matched to a catalog ingredient, for the domain. Free-text items are subtracted
 * from unmatched lines by name afterwards (`subtractFreeTextPantry`).
 */
export function pantryEntries(items: readonly PantryItem[]): PantryEntry[] {
  const out: PantryEntry[] = [];
  for (const item of items) {
    if (item.ingredientId == null) continue;
    out.push({ ingredient_id: item.ingredientId, quantity: item.qty, unit: item.unit });
  }
  return out;
}

export function buildPlannedList(input: PlannedListInput): PlannedList {
  const recipes: ShoppingRecipe[] = [];
  const missing = new Set<string>();
  for (const meal of input.meals) {
    const recipe = input.recipes.get(meal.recipeId);
    if (!recipe) {
      missing.add(meal.recipeId);
      continue;
    }
    recipes.push({
      recipeId: recipe.id,
      servings: recipe.servings,
      plannedServings: meal.servings,
      portion: meal.meal === 'snack' ? 1 : input.portion,
      ingredients: recipe.ingredients.map((line) => ({
        ingredient_id: line.ingredientId,
        text: line.text,
        quantity: line.quantity,
        unit: line.unit,
        grams: line.grams,
        optional: line.optional,
      })),
    });
  }

  const ingredients: Record<string, ShoppingIngredient> = {};
  const ingredientsById = new Map<string, Ingredient>();
  for (const ingredient of input.ingredients) {
    ingredients[ingredient.id] = toShoppingIngredient(ingredient);
    ingredientsById.set(ingredient.id, ingredient);
  }

  const list = subtractFreeTextPantry(
    buildShoppingList({ recipes, ingredients, pantry: pantryEntries(input.pantry) }),
    input.pantry,
  );
  return {
    groups: arrangeAisles(groupByAisle(list.items)),
    items: list.items,
    inPantry: list.inPantry,
    mealCount: recipes.length,
    missingRecipeIds: [...missing],
    ingredientsById,
  };
}

/** Ingredient ids used by the given recipes, for loading their catalog details in one query. */
export function ingredientIdsOf(recipes: Iterable<ListRecipe>): string[] {
  const ids = new Set<string>();
  for (const recipe of recipes) {
    for (const line of recipe.ingredients) if (line.ingredientId) ids.add(line.ingredientId);
  }
  return [...ids].sort();
}
