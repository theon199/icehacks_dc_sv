/**
 * Ingredient lines as the recipe screen shows them: scaled to the chosen servings (with the domain's
 * whole-item rounding and small-appetite half portions), written in the person's unit system, and
 * marked when the person already has the ingredient at home.
 */
import { scaleRecipe, type ScaledLine } from '@/domain/portions';
import {
  formatAmount,
  formatQuantity,
  lookupUnit,
  parseAmount,
  type UnitSystem,
} from '@/domain/units';
import type { RecipeIngredientLine } from '@/lib/catalog';

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

const LEADING_WORD = /^\s*([A-Za-z]+\.?)(?![-'’\w])\s*/;
/** A package-size note right after the leading number: the "(400g)" in "1 (400g) tin tomatoes". */
const PACKAGE_NOTE = /^[^A-Za-z(]*(\([^)]*\))/;

function capitalise(text: string): string {
  return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
}

/**
 * The ingredient part of a catalog line. Lines start with an amount ("2 cups flour") or, in some
 * sources, with a bare unit word ("pinch chopped parsley"); both are removed so the amount column
 * is the only place an amount appears. A package size given with the amount is kept with the name
 * ("1 (400g) tin tomatoes" → "Tomatoes (400g)"), since it says how big each tin or pack is and does
 * not change with servings.
 */
export function ingredientName(text: string): string {
  const parsed = parseAmount(text);
  let rest = parsed.rest;
  if (parsed.quantity !== null) {
    const note = PACKAGE_NOTE.exec(text)?.[1];
    if (note) {
      const name = rest.trim();
      rest = `${name.startsWith(note) ? name.slice(note.length).trim() : name} ${note}`;
    }
  } else {
    const word = LEADING_WORD.exec(rest);
    if (word && lookupUnit(word[1]) !== null) {
      rest = rest
        .slice(word[0].length)
        .replace(/^of\b\s*/i, '')
        .trim();
    }
  }
  return capitalise(rest.trim() || text.trim());
}

/** Readable amount for one scaled line in the chosen system, or null when it has none. */
export function formatLineAmount(
  scaled: Pick<ScaledLine, 'quantity' | 'unit'> & { line: { unit: string | null } },
  system: UnitSystem,
): string | null {
  const { quantity, unit } = scaled;
  if (quantity === null || !Number.isFinite(quantity) || quantity <= 0) return null;
  if (unit !== null) return formatAmount(quantity, unit, { system });
  // Counted items ("2 onions") and unit words we cannot convert keep kitchen fractions.
  const count = formatQuantity(quantity, { system: 'us' });
  const word = scaled.line.unit?.trim();
  return word ? `${count} ${word}` : count;
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
    const amount = formatLineAmount(entry, input.system);
    return {
      key: `line-${line.position}`,
      ingredientId: line.ingredientId,
      amount,
      // A line without an amount reads best exactly as written ("Salt to taste").
      name: amount === null ? capitalise(line.text.trim()) : ingredientName(line.text),
      text: line.text,
      section: line.section,
      optional: line.optional,
      owned,
      rounded: entry.adjusted,
    };
  });
  return { rows, portion: scaled.portion, factor: scaled.factor, ownedCount };
}
