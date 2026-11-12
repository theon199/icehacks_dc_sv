/**
 * Shopping list types. Ingredient and line shapes follow the `ingredients` and
 * `recipe_ingredients` tables in docs/DATA.md (with `grams_per_unit` already JSON-parsed).
 */
import type { PortionLine } from '../portions';
import type { GramsPerUnitInput, UnitId } from '../units';

export interface ShoppingIngredient {
  readonly id: string;
  readonly name: string;
  readonly plural?: string | null | undefined;
  readonly aisle?: string | null | undefined;
  readonly pantry_staple?: boolean | number | null | undefined;
  readonly grams_per_unit?: GramsPerUnitInput;
}

export type ShoppingLine = PortionLine;

/** A planned recipe contributing to the list. */
export interface ShoppingRecipe {
  readonly recipeId: string;
  /** Servings the recipe's quantities make. */
  readonly servings: number;
  /** Servings planned. */
  readonly plannedServings: number;
  /** Portion size per serving (0.5 for small appetite). Default 1. */
  readonly portion?: number | undefined;
  readonly ingredients: readonly ShoppingLine[];
}

/** What the person has at home. No quantity means "I have some", which covers any need. */
export interface PantryEntry {
  readonly ingredient_id: string;
  readonly quantity?: number | null | undefined;
  readonly unit?: string | null | undefined;
}

/**
 * One merged amount. Measured amounts are kept in grams or millilitres; counts in their own unit.
 * Amounts in units we do not recognise keep their original word in `label` and have no `unit`.
 */
export interface Amount {
  readonly quantity: number;
  readonly unit: UnitId | null;
  readonly label: string | null;
}

export type PantryCoverage = 'none' | 'partial' | 'covered';

export interface ShoppingItem {
  /** Stable key: `i:<ingredient id>` or `t:<normalised text>` for unmatched lines. */
  readonly key: string;
  readonly ingredientId: string | null;
  readonly name: string;
  readonly plural: string | null;
  /** Normalised aisle id, `other` when unknown. */
  readonly aisle: string;
  /** Amounts still to buy. */
  readonly amounts: readonly Amount[];
  /** Some recipe uses it without a quantity ("to taste"). */
  readonly asNeeded: boolean;
  readonly recipeIds: readonly string[];
  /** Every use of it is marked optional. */
  readonly optional: boolean;
  readonly staple: boolean;
  readonly pantry: PantryCoverage;
}

export interface AisleGroup {
  readonly aisle: string;
  readonly title: string;
  readonly items: readonly ShoppingItem[];
}
