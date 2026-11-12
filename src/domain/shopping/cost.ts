/**
 * Cost estimates by package share: an item costs the fraction of a package it uses. A recipe that
 * needs 250 g from a 1 kg bag priced $4 costs $1, because the rest of the bag stays for later.
 * The whole-package total (what the till will actually say) is reported alongside.
 *
 * Pantry staples cost $0 (they are assumed to be at home), as do items the pantry covers. Items
 * with no price, a unit that cannot be converted to the price's unit, or no quantity are left out
 * of the total and listed in `missing`, so the UI can say "estimate excludes 2 items".
 * All money is in integer cents to avoid floating-point drift.
 */
import {
  convertAmount,
  lookupUnit,
  normalizeGramsPerUnit,
  type GramsPerUnit,
  type UnitId,
} from '../units';
import { buildShoppingList } from './aggregate';
import type { ShoppingIngredient, ShoppingItem, ShoppingRecipe } from './types';

export interface PriceRecord {
  /** Price of one package in dollars. */
  readonly price: number;
  /** Package size in `unit`, e.g. 1 for "1 lb", 12 for "12 each". */
  readonly packageQty: number;
  readonly unit: string;
  /** Where the price came from, shown as a citation. */
  readonly source: string;
  /** ISO timestamp of when the price was fetched. */
  readonly fetchedAt: string;
}

export type CostStatus =
  | 'priced'
  | 'staple'
  | 'in_pantry'
  | 'no_price'
  | 'invalid_price'
  | 'unit_mismatch'
  | 'no_quantity';

export interface ItemCost {
  readonly key: string;
  readonly status: CostStatus;
  /** Package-share cost; 0 unless priced. */
  readonly cents: number;
  /** Whole packages to buy, when priced. */
  readonly packages: number | null;
  readonly wholePackageCents: number | null;
  readonly source: string | null;
  readonly fetchedAt: string | null;
  /** The price is older than the freshness window. */
  readonly stale: boolean;
}

export interface CostEstimate {
  readonly totalCents: number;
  readonly wholePackageCents: number;
  readonly items: readonly ItemCost[];
  readonly missing: readonly { key: string; name: string; status: CostStatus }[];
  /** Distinct price sources used, sorted. */
  readonly sources: readonly string[];
  /** True when every item that needs buying has a price. */
  readonly complete: boolean;
}

export interface CostInput {
  readonly items: readonly ShoppingItem[];
  /** Items the pantry covers; costed at $0. */
  readonly inPantry?: readonly ShoppingItem[] | undefined;
  readonly ingredients: Readonly<Record<string, ShoppingIngredient>>;
  /** Price per ingredient id. */
  readonly prices: Readonly<Record<string, PriceRecord>>;
  /** Injected clock for freshness; when absent nothing is marked stale. */
  readonly now?: Date | undefined;
  readonly staleAfterDays?: number | undefined;
}

const DAY_MS = 86_400_000;

function isValidPrice(p: PriceRecord): { unit: UnitId; qty: number } | null {
  const found = lookupUnit(p.unit);
  if (!found || !Number.isFinite(p.price) || p.price < 0) return null;
  const qty = p.packageQty * found.scale;
  if (!Number.isFinite(qty) || qty <= 0) return null;
  return { unit: found.unit, qty };
}

function neededIn(item: ShoppingItem, unit: UnitId, gpu: GramsPerUnit): number | null {
  let total = 0;
  for (const a of item.amounts) {
    if (a.unit === null) return null;
    const q = convertAmount(a.quantity, a.unit, unit, gpu);
    if (q === null) return null;
    total += q;
  }
  return total;
}

function zero(key: string, status: CostStatus): ItemCost {
  return {
    key,
    status,
    cents: 0,
    packages: null,
    wholePackageCents: null,
    source: null,
    fetchedAt: null,
    stale: false,
  };
}

export function costItem(
  item: ShoppingItem,
  input: Pick<CostInput, 'ingredients' | 'prices' | 'now' | 'staleAfterDays'>,
): ItemCost {
  if (item.staple) return zero(item.key, 'staple');
  if (item.pantry === 'covered') return zero(item.key, 'in_pantry');
  const record = item.ingredientId === null ? undefined : input.prices[item.ingredientId];
  if (!record) return zero(item.key, 'no_price');
  const price = isValidPrice(record);
  if (!price) return zero(item.key, 'invalid_price');
  if (item.amounts.length === 0) return zero(item.key, 'no_quantity');
  const info = item.ingredientId === null ? undefined : input.ingredients[item.ingredientId];
  const needed = neededIn(item, price.unit, normalizeGramsPerUnit(info?.grams_per_unit));
  if (needed === null) return zero(item.key, 'unit_mismatch');

  const share = needed / price.qty;
  const packageCents = Math.round(record.price * 100);
  const packages = Math.max(1, Math.ceil(share - 1e-9));
  let stale = false;
  const fetched = Date.parse(record.fetchedAt);
  if (input.now !== undefined && Number.isFinite(fetched)) {
    const days = input.staleAfterDays ?? 30;
    stale = input.now.getTime() - fetched > days * DAY_MS;
  }
  return {
    key: item.key,
    status: 'priced',
    cents: Math.round(record.price * 100 * share),
    packages,
    wholePackageCents: packages * packageCents,
    source: record.source,
    fetchedAt: record.fetchedAt,
    stale,
  };
}

const MISSING: ReadonlySet<CostStatus> = new Set<CostStatus>([
  'no_price',
  'invalid_price',
  'unit_mismatch',
  'no_quantity',
]);

export function estimateListCost(input: CostInput): CostEstimate {
  const all = [...input.items, ...(input.inPantry ?? [])];
  const items = all.map((item) => costItem(item, input));
  const missing = items
    .map((c, i) => ({ c, item: all[i] as ShoppingItem }))
    .filter(
      ({ c, item }) => MISSING.has(c.status) && !(item.optional && c.status === 'no_quantity'),
    )
    .map(({ c, item }) => ({ key: c.key, name: item.name, status: c.status }));
  const sources = [...new Set(items.map((c) => c.source).filter((s): s is string => s !== null))];
  return {
    totalCents: items.reduce((s, c) => s + c.cents, 0),
    wholePackageCents: items.reduce((s, c) => s + (c.wholePackageCents ?? 0), 0),
    items,
    missing,
    sources: sources.sort(),
    complete: missing.length === 0,
  };
}

export interface RecipeCost extends CostEstimate {
  readonly perServingCents: number;
}

/** Package-share cost of cooking one recipe for its planned servings (pantry not subtracted). */
export function estimateRecipeCost(
  recipe: ShoppingRecipe,
  options: Omit<CostInput, 'items' | 'inPantry'>,
): RecipeCost {
  const list = buildShoppingList({ recipes: [recipe], ingredients: options.ingredients });
  const estimate = estimateListCost({ ...options, items: list.items });
  const servings = recipe.plannedServings > 0 ? recipe.plannedServings : recipe.servings || 1;
  return { ...estimate, perServingCents: Math.round(estimate.totalCents / servings) };
}
