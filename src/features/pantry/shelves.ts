/**
 * How pantry items read on screen: shelf names, amounts and use-by hints.
 */
import { formatAmount, formatQuantity, lookupUnit, type UnitSystem } from '@/domain/units';
import type { IngredientCategory } from '@/lib/catalog';
import type { PantryItem } from '@/stores/pantry';

export const SHELF_TITLES: Readonly<Record<IngredientCategory, string>> = {
  produce: 'Fruit & veg',
  protein: 'Meat, fish & tofu',
  dairy: 'Dairy & eggs',
  grain: 'Grains, bread & pasta',
  legume: 'Beans & lentils',
  nut_seed: 'Nuts & seeds',
  spice: 'Herbs & spices',
  condiment: 'Sauces & condiments',
  oil: 'Oils & vinegars',
  sweetener: 'Sweeteners',
  beverage: 'Drinks',
  other: 'Other',
};

/**
 * "2", "500 g", "1 ½ cups", "3 tins" — or null when the person only noted that they have some.
 * Recognised units are shown in the person's measurement system.
 */
export function quantityLabel(
  item: Pick<PantryItem, 'qty' | 'unit'>,
  system: UnitSystem,
): string | null {
  if (item.qty == null) return null;
  const options = { system } as const;
  if (item.unit == null) return formatQuantity(item.qty, options);
  const known = lookupUnit(item.unit);
  if (known) return formatAmount(item.qty * known.scale, known.unit, options);
  return `${formatQuantity(item.qty, options)} ${item.unit}`;
}

export type ExpiryTone = 'past' | 'soon' | 'later';

export interface ExpiryHint {
  readonly tone: ExpiryTone;
  readonly label: string;
}

const DAY_MS = 86_400_000;
/** Items due within this many days are flagged "use soon". */
export const USE_SOON_DAYS = 3;

/** Whole local calendar days from `now` to the use-by date (negative once it has passed). */
export function daysUntil(expiresAt: string, now: Date): number | null {
  const due = new Date(expiresAt);
  if (Number.isNaN(due.getTime())) return null;
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOf(due) - startOf(now)) / DAY_MS);
}

export function expiryHint(expiresAt: string | null, now: Date): ExpiryHint | null {
  if (!expiresAt) return null;
  const days = daysUntil(expiresAt, now);
  if (days === null) return null;
  if (days < 0) return { tone: 'past', label: 'Past its use-by date' };
  if (days === 0) return { tone: 'soon', label: 'Use today' };
  if (days === 1) return { tone: 'soon', label: 'Use by tomorrow' };
  if (days <= USE_SOON_DAYS) return { tone: 'soon', label: `Use within ${days} days` };
  return { tone: 'later', label: `Good for ${days} days` };
}

/** Use-by date `days` from now, at the end of that local day. */
export function dueInDays(days: number, now: Date): string {
  const due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 23, 59, 59);
  return due.toISOString();
}
