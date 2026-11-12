/**
 * "Mark bought": ticked items move into the pantry, so the list shrinks and the pantry knows what
 * was just brought home.
 */
import type { Amount, ShoppingItem } from '@/domain/shopping';
import type { Ingredient } from '@/lib/catalog';
import {
  MAX_PANTRY_ITEMS,
  addPantryItem,
  type NewPantryItem,
  type PantryItem,
} from '@/stores/pantry';

import type { ExtraItem } from './extrasStore';

const MAX_UNIT_LENGTH = 24;
/** The pantry's name limit; a long free-text line is cut rather than refused. */
const MAX_NAME_LENGTH = 80;

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
 * A "to taste" use has no amount, so whatever was bought for it counts as a little more than the
 * measured uses need: one more whole item, or a tenth more by weight or volume (at least 1 g or
 * 1 ml). Without that margin the pantry would hold exactly the measured amount, nothing would be
 * left for the "to taste" use, and the item would come straight back onto the list.
 */
function withTasteMargin(amount: Amount, quantity: number): number {
  if (amount.unit === 'g' || amount.unit === 'ml')
    return tidy(quantity + Math.max(quantity * 0.1, 1));
  return quantity + 1;
}

/**
 * Pantry entries for bought list items: one per amount still to buy, or a single "have some"
 * entry when the list had no measurable amount ("salt, as needed"). An item that is also used
 * "to taste" gets a margin on its first amount, so the pantry covers that use too.
 */
export function pantryInputsForItems(
  items: readonly ShoppingItem[],
  ingredients: ReadonlyMap<string, Pick<Ingredient, 'category'>>,
): NewPantryItem[] {
  const out: NewPantryItem[] = [];
  for (const item of items) {
    const base = {
      ingredientId: item.ingredientId,
      name: item.name.slice(0, MAX_NAME_LENGTH).trim(),
      category:
        (item.ingredientId ? ingredients.get(item.ingredientId)?.category : undefined) ?? 'other',
    } as const;
    const measured = item.amounts.filter((amount) => tidy(amount.quantity) > 0);
    if (measured.length === 0) {
      out.push({ ...base, qty: null, unit: null });
      continue;
    }
    measured.forEach((amount, index) => {
      const qty = tidy(amount.quantity);
      out.push({
        ...base,
        qty: item.asNeeded && index === 0 ? withTasteMargin(amount, qty) : qty,
        unit: pantryUnit(amount),
      });
    });
  }
  return out;
}

const sameText = (a: string, b: string) =>
  a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ');

/** Whether the pantry already has an entry this input would top up (same thing, same unit). */
function alreadyThere(items: Readonly<Record<string, PantryItem>>, input: NewPantryItem): boolean {
  const unit = input.unit?.trim() || null;
  return Object.values(items).some(
    (item) =>
      (item.unit ?? null) === unit &&
      (input.ingredientId && item.ingredientId
        ? item.ingredientId === input.ingredientId
        : sameText(item.name, input.name)),
  );
}

/** One bought line (a list item or an extra) and the pantry entries it becomes. */
export interface BoughtLine {
  /** Its check-off key. */
  readonly key: string;
  readonly inputs: readonly NewPantryItem[];
}

/**
 * Splits bought lines into those the pantry can take and those it cannot because it is full
 * (`MAX_PANTRY_ITEMS`). A line moves only if all of its entries fit; topping up an item that is
 * already there always fits. Lines that do not fit stay ticked on the list.
 */
export function fitIntoPantry(
  items: Readonly<Record<string, PantryItem>>,
  lines: readonly BoughtLine[],
  at: string,
): { readonly fits: readonly BoughtLine[]; readonly left: readonly BoughtLine[] } {
  const fits: BoughtLine[] = [];
  const left: BoughtLine[] = [];
  let current = items;
  let probe = 0;
  for (const line of lines) {
    let next = current;
    let ok = true;
    for (const input of line.inputs) {
      const full = Object.keys(next).length >= MAX_PANTRY_ITEMS;
      const after = addPantryItem(next, input, { id: `fit-${probe++}`, at });
      // Unchanged while full means there was no room for a new item, unless it matched one
      // already there and the top-up changed nothing ("have some" onto "have some").
      if (after === next && full && !alreadyThere(next, input)) {
        ok = false;
        break;
      }
      next = after;
    }
    if (ok) {
      current = next;
      fits.push(line);
    } else left.push(line);
  }
  return { fits, left };
}

/** Hand-added extras go on the "Other" shelf with no quantity. */
export function pantryInputsForExtras(extras: readonly ExtraItem[]): NewPantryItem[] {
  return extras.map((extra) => ({ name: extra.name, qty: null, unit: null, category: 'other' }));
}
