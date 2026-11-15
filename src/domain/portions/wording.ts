/**
 * How a scaled ingredient line is written: the amount in the person's unit system, and the
 * ingredient without its amount. Shared by every screen that lists a recipe's ingredients, so the
 * recipe page and cook mode always word a line the same way.
 */
import { formatAmount, formatQuantity, lookupUnit, parseAmount, type UnitSystem } from '../units';
import type { ScaledLine } from './scale';

const LEADING_WORD = /^\s*([A-Za-z]+\.?)(?![-'’\w])\s*/;
/** A package-size note right after the leading number: the "(400g)" in "1 (400g) tin tomatoes". */
const PACKAGE_NOTE = /^[^A-Za-z(]*(\([^)]*\))/;

function sameWord(word: string | undefined, other: string | null | undefined): boolean {
  if (!word || !other) return false;
  return word.replace(/\.$/, '').toLowerCase() === other.trim().toLowerCase();
}

function capitalise(text: string): string {
  return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
}

/**
 * The ingredient part of a catalog line. Lines start with an amount ("2 cups flour") or, in some
 * sources, with a bare unit word ("pinch chopped parsley"); both are removed so the amount column
 * is the only place an amount appears. A package size given with the amount is kept with the name
 * ("1 (400g) tin tomatoes" → "Tomatoes (400g)"), since it says how big each tin or pack is and does
 * not change with servings. `unitWord` is the unit the catalog stored for the line; it counts as a
 * unit word here even when it is not one we can convert ("knob Ginger" stored as 1 knob).
 */
export function ingredientName(text: string, unitWord?: string | null): string {
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
    if (word && (lookupUnit(word[1]) !== null || sameWord(word[1], unitWord))) {
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

export interface LineWording {
  /** "1 ½ cups", "250 g", "2"; null for lines without an amount ("salt to taste"). */
  readonly amount: string | null;
  /** The line without its amount, e.g. "Rolled oats". */
  readonly name: string;
}

/** The amount and name of one scaled line, as every ingredient list shows them. */
export function lineWording(
  scaled: Pick<ScaledLine, 'quantity' | 'unit'> & { line: { unit: string | null; text: string } },
  system: UnitSystem,
): LineWording {
  const amount = formatLineAmount(scaled, system);
  // A line without an amount reads best exactly as written ("Salt to taste").
  const name =
    amount === null
      ? capitalise(scaled.line.text.trim())
      : ingredientName(scaled.line.text, scaled.line.unit);
  return { amount, name };
}
