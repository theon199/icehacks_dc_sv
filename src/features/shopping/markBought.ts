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
import { pantryUnitWord, sameName } from './freeText';

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
 * The pantry entry an amount-less list line would top up: one for the same thing that has a
 * quantity, which the plan used up exactly (an entry without a quantity would already cover the
 * line). Catalog items match by ingredient id, unmatched lines by name, as the list subtracts them.
 */
function usedUpEntry(pantry: readonly PantryItem[], item: ShoppingItem): PantryItem | undefined {
  return pantry.find(
    (entry) =>
      entry.qty != null &&
      (item.ingredientId
        ? entry.ingredientId === item.ingredientId
        : entry.ingredientId == null && sameName(entry.name, item.name)),
  );
}

/** A little more of a used-up entry, in its own unit, so something is left for "to taste". */
function topUpFor(entry: PantryItem): number {
  if (entry.unit === 'g' || entry.unit === 'ml') return tidy(Math.max((entry.qty ?? 0) * 0.1, 1));
  return 1;
}

/**
 * Pantry entries for bought list items: one per amount still to buy. When the list had no
 * measurable amount ("salt, as needed"), the entry is a single "have some", or a small top-up of
 * a pantry entry the plan used up exactly ("3 eggs" in the pantry for 3 eggs plus "egg to
 * glaze"); a "have some" next to a counted entry would not change what the list sees. An item
 * that is also used "to taste" gets a margin on its first amount, so the pantry covers that use
 * too.
 */
export function pantryInputsForItems(
  items: readonly ShoppingItem[],
  ingredients: ReadonlyMap<string, Pick<Ingredient, 'category'>>,
  pantry: readonly PantryItem[] = [],
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
      const usedUp = usedUpEntry(pantry, item);
      out.push(
        usedUp
          ? { ...base, qty: topUpFor(usedUp), unit: usedUp.unit }
          : { ...base, qty: null, unit: null },
      );
      continue;
    }
    measured.forEach((amount, index) => {
      const qty = tidy(amount.quantity);
      out.push({
        ...base,
        qty: item.asNeeded && index === 0 ? withTasteMargin(amount, qty) : qty,
        unit: pantryUnitWord(amount),
      });
    });
  }
  return out;
}

/** Whether the pantry already has an entry this input would top up (same thing, same unit). */
function alreadyThere(items: Readonly<Record<string, PantryItem>>, input: NewPantryItem): boolean {
  const unit = input.unit?.trim() || null;
  return Object.values(items).some(
    (item) =>
      (item.unit ?? null) === unit &&
      (input.ingredientId && item.ingredientId
        ? item.ingredientId === input.ingredientId
        : sameName(item.name, input.name)),
  );
}

/** One bought line (a list item or an extra) and the pantry entries it becomes. */
export interface BoughtLine {
  /** Its check-off key. */
  readonly key: string;
  readonly inputs: readonly NewPantryItem[];
  /**
   * The line is gone for good once bought (a hand-added extra), so it leaves the list even when
   * the pantry already had it. A planned line is rebuilt from the plan and the pantry instead.
   */
  readonly leavesList?: boolean;
}

export interface PantryFit {
  /** Lines that go into the pantry and leave the list. */
  readonly fits: readonly BoughtLine[];
  /**
   * Planned lines that would leave the pantry exactly as it is. They stay ticked: clearing them
   * would only bring them straight back, unticked.
   */
  readonly unchanged: readonly BoughtLine[];
  /** Lines the full pantry (`MAX_PANTRY_ITEMS`) has no room for. They stay ticked. */
  readonly left: readonly BoughtLine[];
}

/**
 * Splits bought lines by what the pantry can do with them. A line moves only if all of its
 * entries fit; topping up an item that is already there always fits.
 */
export function fitIntoPantry(
  items: Readonly<Record<string, PantryItem>>,
  lines: readonly BoughtLine[],
  at: string,
): PantryFit {
  const fits: BoughtLine[] = [];
  const unchanged: BoughtLine[] = [];
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
    if (!ok) left.push(line);
    else if (next === current && !line.leavesList) unchanged.push(line);
    else {
      current = next;
      fits.push(line);
    }
  }
  return { fits, unchanged, left };
}

/** The toast after "Add to pantry", from how many lines moved, changed nothing or did not fit. */
export function markBoughtMessage(
  moved: number,
  unchanged: number,
  left: number,
): { readonly message: string; readonly tone: 'success' | 'neutral' | 'danger' } {
  const added = `${moved} ${moved === 1 ? 'item' : 'items'}`;
  if (left > 0) {
    return {
      message:
        moved > 0
          ? `Added ${added}. Your pantry is full (${MAX_PANTRY_ITEMS} items), so ${left} stayed on your list.`
          : `Your pantry is full (${MAX_PANTRY_ITEMS} items). Remove a few things to add more.`,
      tone: 'danger',
    };
  }
  if (moved > 0) return { message: `Added ${added} to your pantry`, tone: 'success' };
  return {
    message:
      unchanged === 1
        ? 'Your pantry already lists that item, so nothing changed. Edit its amount in the pantry.'
        : 'Your pantry already lists those items, so nothing changed. Edit their amounts in the pantry.',
    tone: 'neutral',
  };
}

/** Hand-added extras go on the "Other" shelf with no quantity. Their lines use `leavesList`. */
export function pantryInputsForExtras(extras: readonly ExtraItem[]): NewPantryItem[] {
  return extras.map((extra) => ({ name: extra.name, qty: null, unit: null, category: 'other' }));
}
