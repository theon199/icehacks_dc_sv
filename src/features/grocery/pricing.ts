/**
 * Pure glue between the `prices` edge function and the shopping cost model in
 * `@/domain/shopping`: turns price answers into cost inputs, and a cost estimate into what the
 * cost summary shows (totals, per serving, what is missing and why, and where each price came
 * from).
 */
import type { CostEstimate, PriceRecord, ShoppingItem } from '@/domain/shopping';
import type { IngredientPrice } from '@/lib/api/commerce';

/** Package units from the price lookup that the unit model spells differently. */
const PACKAGE_UNIT_ALIASES: Readonly<Record<string, { unit: string; factor: number }>> = {
  count: { unit: 'each', factor: 1 },
  dozen: { unit: 'each', factor: 12 },
};

/** Shown when a store sent a price but no name. */
export const UNKNOWN_RETAILER = 'Online listing';

/**
 * The cost-model form of one price answer, or null when the answer carries no usable price
 * (still pending, not found, unavailable, or missing its package unit).
 */
export function toPriceRecord(price: IngredientPrice): PriceRecord | null {
  if (price.status !== 'priced' || price.priceCents == null || !price.unit) return null;
  const alias = PACKAGE_UNIT_ALIASES[price.unit];
  const qty = price.packageQty ?? 1;
  return {
    price: price.priceCents / 100,
    packageQty: alias ? qty * alias.factor : qty,
    unit: alias ? alias.unit : price.unit,
    source: price.retailer?.trim() || UNKNOWN_RETAILER,
    fetchedAt: price.fetchedAt ?? '',
  };
}

/** Price records keyed by ingredient id, for `estimateListCost` / `estimateRecipeCost`. */
export function toPriceRecords(
  prices: Readonly<Record<string, IngredientPrice>>,
): Record<string, PriceRecord> {
  const out: Record<string, PriceRecord> = {};
  for (const [id, price] of Object.entries(prices)) {
    const record = toPriceRecord(price);
    if (record) out[id] = record;
  }
  return out;
}

/** The ingredient id behind a shopping item key (`i:<id>`), or null for free-text lines. */
export function ingredientIdOfKey(key: string): string | null {
  return key.startsWith('i:') && key.length > 2 ? key.slice(2) : null;
}

/** Why an item is left out of the estimate, in the terms the summary explains it. */
export type MissingReason =
  /** A lookup is running; the price should arrive shortly. */
  | 'checking'
  /** No store price was found for it. */
  | 'no_price'
  /** No lookup can run right now (limits, eligibility, or a failed request). */
  | 'unavailable'
  /** The price is per package in a unit the recipe amount cannot be converted to. */
  | 'not_comparable'
  /** The recipe gives no amount ("to taste"), so no share can be worked out. */
  | 'no_amount';

export interface MissingItem {
  readonly key: string;
  readonly name: string;
  readonly reason: MissingReason;
}

export interface CostDisplay {
  /** Package-share cost of the priced items, in cents. */
  readonly totalCents: number;
  /** What the priced items cost as whole packages at the till, in cents. */
  readonly wholePackageCents: number;
  /** `totalCents` split over the servings, or null when no serving count applies. */
  readonly perServingCents: number | null;
  readonly pricedCount: number;
  /** Items that need buying, priced or not. */
  readonly toBuyCount: number;
  /** Items left out of the total for a reason other than a lookup in progress. */
  readonly missing: readonly MissingItem[];
  /** Items whose price is still being looked up. */
  readonly checking: readonly MissingItem[];
  /** At least one item has a price, so a total can be shown. */
  readonly hasEstimate: boolean;
  /** The list has no items at all; there is nothing to show. */
  readonly empty: boolean;
  /** There are items, but every one is a staple or already at home. */
  readonly nothingToBuy: boolean;
  /** Every item that needs buying is priced. */
  readonly complete: boolean;
}

export interface CostDisplayInput {
  readonly estimate: CostEstimate;
  /** Servings the estimate feeds; omit (or pass 0) for no per-serving figure. */
  readonly servings?: number | null | undefined;
  /** The latest price answer per ingredient id, priced or not. */
  readonly prices: Readonly<Record<string, IngredientPrice>>;
  /**
   * No lookup will run for items without an answer (offline, signed out, request failed), so
   * they are reported as unavailable rather than as being checked.
   */
  readonly lookupStopped?: boolean | undefined;
}

function missingReason(
  status: CostEstimate['missing'][number]['status'],
  answer: IngredientPrice | undefined,
  ingredientId: string | null,
  lookupStopped: boolean,
): MissingReason {
  if (status === 'unit_mismatch' || status === 'invalid_price') return 'not_comparable';
  if (status === 'no_quantity') return 'no_amount';
  // Free-text lines are never looked up.
  if (ingredientId === null) return 'no_price';
  switch (answer?.status) {
    case 'not_found':
      return 'no_price';
    case 'pending':
      return lookupStopped ? 'unavailable' : 'checking';
    case 'unavailable':
      return 'unavailable';
    default:
      return lookupStopped ? 'unavailable' : 'checking';
  }
}

const EXCLUDED_FROM_PURCHASE: ReadonlySet<string> = new Set(['staple', 'in_pantry']);

/** What the cost summary shows for an estimate. All money stays in integer cents. */
export function buildCostDisplay(input: CostDisplayInput): CostDisplay {
  const { estimate, prices } = input;
  const lookupStopped = input.lookupStopped ?? false;
  const missing: MissingItem[] = [];
  const checking: MissingItem[] = [];
  for (const item of estimate.missing) {
    const ingredientId = ingredientIdOfKey(item.key);
    const answer = ingredientId === null ? undefined : prices[ingredientId];
    const reason = missingReason(item.status, answer, ingredientId, lookupStopped);
    const entry = { key: item.key, name: item.name, reason };
    (reason === 'checking' ? checking : missing).push(entry);
  }
  const pricedCount = estimate.items.filter((c) => c.status === 'priced').length;
  const toBuyCount = estimate.items.filter((c) => !EXCLUDED_FROM_PURCHASE.has(c.status)).length;
  const servings = input.servings ?? 0;
  const hasEstimate = pricedCount > 0;
  return {
    totalCents: estimate.totalCents,
    wholePackageCents: estimate.wholePackageCents,
    perServingCents:
      hasEstimate && Number.isFinite(servings) && servings > 0
        ? Math.round(estimate.totalCents / servings)
        : null,
    pricedCount,
    toBuyCount,
    missing,
    checking,
    hasEstimate,
    empty: estimate.items.length === 0,
    nothingToBuy: estimate.items.length > 0 && toBuyCount === 0,
    complete: hasEstimate && missing.length === 0 && checking.length === 0,
  };
}

/** One line of the sources sheet: where one ingredient's price came from. */
export interface SourceRow {
  readonly ingredientId: string;
  readonly name: string;
  readonly retailer: string;
  /** Product page, only when it is an https link that is safe to open. */
  readonly url: string | null;
  /** Shelf price of one package. */
  readonly priceCents: number;
  readonly currency: string;
  readonly packageQty: number | null;
  readonly unit: string | null;
  /** When the price was checked (ISO), if known. */
  readonly fetchedAt: string | null;
  /** The store did not list an exact price; the figure is an estimate. */
  readonly estimated: boolean;
  /** This item's share of the estimate, in cents. */
  readonly shareCents: number;
}

const SAFE_LINK = /^https:\/\/[^\s/?#@]+\.[^\s/?#@]+(?:[/?#]\S*)?$/i;

/** An https URL with a dotted host, or null. Anything else is never opened. */
export function safeLink(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  return trimmed.length <= 2048 && SAFE_LINK.test(trimmed) ? trimmed : null;
}

/** Sources for every priced item in the estimate, sorted by item name. */
export function buildSourceRows(
  estimate: CostEstimate,
  prices: Readonly<Record<string, IngredientPrice>>,
  names: Readonly<Record<string, string>>,
): SourceRow[] {
  const rows: SourceRow[] = [];
  for (const item of estimate.items) {
    if (item.status !== 'priced') continue;
    const id = ingredientIdOfKey(item.key);
    const price = id === null ? undefined : prices[id];
    if (id === null || !price || price.priceCents == null) continue;
    rows.push({
      ingredientId: id,
      name: names[id] ?? id,
      retailer: price.retailer?.trim() || UNKNOWN_RETAILER,
      url: safeLink(price.url),
      priceCents: price.priceCents,
      currency: price.currency,
      packageQty: price.packageQty,
      unit: price.unit,
      fetchedAt: price.fetchedAt,
      estimated: price.confidence === 'estimated',
      shareCents: item.cents,
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** Distinct store names behind the rows, most-used first. */
export function retailerSummary(rows: readonly SourceRow[]): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.retailer, (counts.get(row.retailer) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
}

/**
 * An optional item the recipes give no amount for ("chives to garnish, optional"): there is no
 * share to cost and nobody needs to buy it, so it is neither priced nor counted as missing.
 */
export function isOptionalWithoutAmount(item: ShoppingItem): boolean {
  return item.optional && item.amounts.length === 0;
}

/** The items an estimate covers: the list without optional items that have no amount. */
export function itemsToCost(items: readonly ShoppingItem[]): readonly ShoppingItem[] {
  const kept = items.filter((item) => !isOptionalWithoutAmount(item));
  return kept.length === items.length ? items : kept;
}

/**
 * Ingredient ids that must be bought, sorted: not staples, not covered by the pantry, and not
 * optional items without an amount.
 */
export function idsToBuy(items: readonly ShoppingItem[]): string[] {
  const ids = new Set<string>();
  for (const item of items) {
    if (item.staple || item.pantry === 'covered' || item.ingredientId === null) continue;
    if (isOptionalWithoutAmount(item)) continue;
    ids.add(item.ingredientId);
  }
  return [...ids].sort();
}
