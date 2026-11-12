/**
 * "Mark bought": ticked items move into the pantry, so the list shrinks and the pantry knows what
 * was just brought home.
 */
import type { Amount, ShoppingItem } from '@/domain/shopping';
import type { Ingredient } from '@/lib/catalog';
import type { NewPantryItem } from '@/stores/pantry';

import type { ExtraItem } from './extrasStore';

const MAX_UNIT_LENGTH = 24;

/**
 * Grams and millilitres to one decimal, rounded up: what was bought always covers what the list
 * asked for, so a rounding crumb ("⅛ tsp garlic") never stays behind on the list. Counts are
 * already whole.
 */
function tidy(quantity: number): number {
  return Math.ceil(quantity * 10 - 1e-9) / 10;
}

/**
 * The pantry unit for a bought amount. Whole items carry no unit (a bare count is how the pantry
 * and the list both read "3 eggs"); an unrecognised unit word is kept as written.
 */
function pantryUnit(amount: Amount): string | null {
  if (amount.unit === 'each') return null;
  if (amount.unit !== null) return amount.unit;
  const label = amount.label?.trim();
  return label ? label.slice(0, MAX_UNIT_LENGTH) : null;
}

/**
 * Pantry entries for bought list items: one per amount still to buy, or a single "have some"
 * entry when the list had no measurable amount ("salt, as needed").
 */
export function pantryInputsForItems(
  items: readonly ShoppingItem[],
  ingredients: ReadonlyMap<string, Pick<Ingredient, 'category'>>,
): NewPantryItem[] {
  const out: NewPantryItem[] = [];
  for (const item of items) {
    const base = {
      ingredientId: item.ingredientId,
      name: item.name,
      category:
        (item.ingredientId ? ingredients.get(item.ingredientId)?.category : undefined) ?? 'other',
    } as const;
    const measured = item.amounts.filter((amount) => tidy(amount.quantity) > 0);
    if (measured.length === 0) {
      out.push({ ...base, qty: null, unit: null });
      continue;
    }
    for (const amount of measured) {
      out.push({ ...base, qty: tidy(amount.quantity), unit: pantryUnit(amount) });
    }
  }
  return out;
}

/** Hand-added extras go on the "Other" shelf with no quantity. */
export function pantryInputsForExtras(extras: readonly ExtraItem[]): NewPantryItem[] {
  return extras.map((extra) => ({ name: extra.name, qty: null, unit: null, category: 'other' }));
}
