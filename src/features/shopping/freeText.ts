/**
 * List lines the catalog could not match ("1 handful fresh coriander") have no ingredient id, so
 * the domain cannot subtract the pantry from them. Here they are matched to free-text pantry
 * items by name instead, and subtracted amount by amount when the unit words agree.
 */
import { compareItems, type Amount, type ShoppingItem } from '@/domain/shopping';
import type { PantryItem } from '@/stores/pantry';

const EPSILON = 1e-9;
/** The pantry's unit limit; a long unit word is cut to fit. */
const MAX_UNIT_LENGTH = 24;

const normalise = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');

/** Whether two names read the same, ignoring case and spacing. */
export const sameName = (a: string, b: string) => normalise(a) === normalise(b);

/**
 * The unit word the pantry records for a bought amount. Whole items carry no unit (a bare count
 * is how the pantry and the list both read "3 eggs"); an unrecognised unit word is kept as is.
 */
export function pantryUnitWord(amount: Amount): string | null {
  if (amount.unit === 'each') return null;
  if (amount.unit !== null) return amount.unit;
  const label = amount.label?.trim().slice(0, MAX_UNIT_LENGTH).trim();
  return label ? label : null;
}

const unitKey = (unit: string | null | undefined) => (unit ? normalise(unit) : '');

/** Subtracts matching free-text pantry items from one unmatched list line. */
function coverLine(item: ShoppingItem, entries: readonly PantryItem[]): ShoppingItem {
  if (entries.some((entry) => entry.qty == null)) return { ...item, pantry: 'covered' };

  const stock = new Map<string, number>();
  for (const entry of entries) {
    const key = unitKey(entry.unit);
    stock.set(key, (stock.get(key) ?? 0) + (entry.qty ?? 0));
  }

  let changed = false;
  const amounts: Amount[] = [];
  for (const amount of item.amounts) {
    const key = unitKey(pantryUnitWord(amount));
    const have = stock.get(key) ?? 0;
    const used = Math.min(have, amount.quantity);
    if (used > EPSILON) {
      changed = true;
      stock.set(key, have - used);
    }
    const rest = amount.quantity - used;
    if (rest > EPSILON) amounts.push(used > EPSILON ? { ...amount, quantity: rest } : amount);
  }
  // Stock left after the measured amounts covers a "to taste" use, as it does for catalog items.
  const leftover = [...stock.values()].some((quantity) => quantity > EPSILON);
  const asNeeded = item.asNeeded && !leftover;
  if (amounts.length === 0 && !asNeeded) return { ...item, pantry: 'covered' };
  if (!changed && asNeeded === item.asNeeded) return item;
  return { ...item, amounts, asNeeded, pantry: 'partial' };
}

/**
 * Moves unmatched lines the pantry covers into `inPantry` and trims the ones it partly covers.
 * A covered line keeps the amounts the plan uses, for the "already have" section.
 */
export function subtractFreeTextPantry(
  list: { readonly items: readonly ShoppingItem[]; readonly inPantry: readonly ShoppingItem[] },
  pantry: readonly PantryItem[],
): { readonly items: readonly ShoppingItem[]; readonly inPantry: readonly ShoppingItem[] } {
  const loose = pantry.filter((entry) => entry.ingredientId == null);
  if (loose.length === 0 || !list.items.some((item) => item.ingredientId === null)) return list;

  const items: ShoppingItem[] = [];
  const covered: ShoppingItem[] = [];
  for (const item of list.items) {
    const entries =
      item.ingredientId === null ? loose.filter((entry) => sameName(entry.name, item.name)) : [];
    const next = entries.length > 0 ? coverLine(item, entries) : item;
    if (next.pantry === 'covered') covered.push(next);
    else items.push(next);
  }
  if (covered.length === 0) return { items, inPantry: list.inPantry };
  return { items, inPantry: [...list.inPantry, ...covered].sort(compareItems) };
}
