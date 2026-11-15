/**
 * Ingredient lines as the recipe screen shows them: scaled to the chosen servings (with the domain's
 * whole-item rounding and small-appetite half portions), written in the person's unit system, and
 * marked when the person already has the ingredient at home.
 */
import { lineWording, scaleRecipe } from '@/domain/portions';
import type { UnitSystem } from '@/domain/units';
import type { RecipeIngredientLine } from '@/lib/catalog';

export { formatLineAmount, ingredientName } from '@/domain/portions';

export const MIN_SERVINGS = 1;
export const MAX_SERVINGS = 20;

export function clampServings(value: number): number {
  if (!Number.isFinite(value)) return MIN_SERVINGS;
  return Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, Math.round(value)));
}

export interface IngredientRow {
  /** Stable across re-renders: the line's position in the recipe. */
  readonly key: string;
  readonly ingredientId: string | null;
  /** "1 ½ cups", "250 g", "2"; null for lines without an amount ("salt to taste"). */
  readonly amount: string | null;
  /** The line without its amount, e.g. "rolled oats". */
  readonly name: string;
  /** The catalog's original line, for accessibility and lines that could not be scaled. */
  readonly text: string;
  readonly section: string | null;
  readonly optional: boolean;
  /** The person has this ingredient in their pantry. */
  readonly owned: boolean;
  /** Rounding to a usable amount moved it by more than 10% from the exact scaled value. */
  readonly rounded: boolean;
}

export interface BuildRowsInput {
  readonly lines: readonly RecipeIngredientLine[];
  /** Servings the catalog quantities make. */
  readonly baseServings: number;
  readonly servings: number;
  readonly smallAppetite: boolean;
  readonly system: UnitSystem;
  readonly pantry: ReadonlySet<string>;
}

export interface BuiltRows {
  readonly rows: readonly IngredientRow[];
  /** Portion size per serving (0.5 in small appetite mode). */
  readonly portion: number;
  /** Multiplier applied to the catalog quantities. */
  readonly factor: number;
  readonly ownedCount: number;
}

export function buildIngredientRows(input: BuildRowsInput): BuiltRows {
  const scaled = scaleRecipe(
    {
      servings: input.baseServings,
      ingredients: input.lines.map((line) => ({
        ...line,
        ingredient_id: line.ingredientId,
      })),
    },
    clampServings(input.servings),
    { smallAppetite: input.smallAppetite },
  );
  let ownedCount = 0;
  const rows = scaled.lines.map((entry): IngredientRow => {
    const line = entry.line;
    const owned = line.ingredientId !== null && input.pantry.has(line.ingredientId);
    if (owned) ownedCount += 1;
    const { amount, name } = lineWording(entry, input.system);
    return {
      key: `line-${line.position}`,
      ingredientId: line.ingredientId,
      amount,
      name,
      text: line.text,
      section: line.section,
      optional: line.optional,
      owned,
      rounded: entry.adjusted,
    };
  });
  return { rows, portion: scaled.portion, factor: scaled.factor, ownedCount };
}
