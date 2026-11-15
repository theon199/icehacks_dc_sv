/**
 * The ingredient checklist in cook mode, worded exactly as the recipe page words it: scaled to the
 * recipe's servings with the person's small-appetite setting, in their unit system, with the amount
 * split from the name. Ticks stay keyed by the catalog line's position.
 */
import { lineWording, scaleRecipe } from '@/domain/portions';
import type { UnitSystem } from '@/domain/units';
import type { RecipeIngredientLine } from '@/lib/catalog';

export interface CookIngredient {
  /** The catalog line's position: what a tick is stored against. */
  readonly position: number;
  /** "2 tbsp", "1 knob"; null for lines without an amount ("Juice of one lime"). */
  readonly amount: string | null;
  readonly name: string;
  readonly optional: boolean;
  /** Amount and name read together, for VoiceOver. */
  readonly label: string;
}

export interface CookIngredientsInput {
  readonly lines: readonly RecipeIngredientLine[];
  /** Servings the catalog quantities make, which is also what cook mode cooks. */
  readonly servings: number;
  readonly smallAppetite: boolean;
  readonly system: UnitSystem;
}

/** Scaled with the same rounding and worded by the same rules as the recipe page's list. */
export function cookIngredients(input: CookIngredientsInput): CookIngredient[] {
  const scaled = scaleRecipe(
    {
      servings: input.servings,
      ingredients: input.lines.map((line) => ({ ...line, ingredient_id: line.ingredientId })),
    },
    input.servings,
    { smallAppetite: input.smallAppetite },
  );
  return scaled.lines.map((entry) => {
    const { amount, name } = lineWording(entry, input.system);
    const label = amount ? `${amount} ${name}` : name;
    return {
      position: entry.line.position,
      amount,
      name,
      optional: entry.line.optional,
      label: entry.line.optional ? `${label}, optional` : label,
    };
  });
}
