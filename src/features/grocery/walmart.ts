/**
 * Rules for the "Buy at Walmart" action: which ingredients can go in the cart, when the button
 * shows, how the cart request is built, and how its outcome is described.
 */
import type {
  WalmartCartRequest,
  WalmartCartResponse,
  WalmartPrice,
  WalmartStatus,
} from '@/lib/api/commerce';

/** Lines one cart request may hold. */
export const MAX_CART_LINES = 25;

/**
 * Ingredients whose reviewed Walmart item was found and is in stock. Unmapped ingredients, items
 * Walmart no longer lists and out-of-stock items stay off the cart.
 */
export function cartReadyIds(prices: readonly WalmartPrice[]): Set<string> {
  const ready = new Set<string>();
  for (const price of prices) {
    if (price.status === 'found' && price.itemId !== null && price.available) {
      ready.add(price.ingredientId);
    }
  }
  return ready;
}

/**
 * The button shows only when the integration reports itself configured and at least one
 * ingredient that still needs buying has a cart-ready item.
 */
export function shouldShowWalmart(
  status: WalmartStatus | undefined,
  idsToBuy: readonly string[],
  readyIds: ReadonlySet<string> | undefined,
): boolean {
  if (status?.configured !== true || !readyIds) return false;
  return idsToBuy.some((id) => readyIds.has(id));
}

export interface CartPlan {
  readonly request: WalmartCartRequest;
  /** Cart-ready ingredients left out because the cart was full. */
  readonly overflowIds: readonly string[];
}

/**
 * One line per cart-ready ingredient, in the order given, quantity 1 each: the store's package
 * sizes differ from the ones the estimate was priced with, so the cart starts from one of each
 * and the shopper adjusts. Null when nothing can go in the cart.
 */
export function planCart(
  idsToBuy: readonly string[],
  readyIds: ReadonlySet<string>,
): CartPlan | null {
  const ready = [...new Set(idsToBuy)].filter((id) => readyIds.has(id));
  if (ready.length === 0) return null;
  return {
    request: {
      items: ready
        .slice(0, MAX_CART_LINES)
        .map((ingredient_id) => ({ ingredient_id, quantity: 1 })),
    },
    overflowIds: ready.slice(MAX_CART_LINES),
  };
}

export type CartOutcome =
  | { readonly kind: 'opened'; readonly url: string; readonly leftOut: readonly string[] }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'empty' };

/**
 * What a cart answer means for the shopper. `leftOut` names (by ingredient id) everything that
 * is not in the opened cart: lines the server skipped, plus the overflow beyond one cart.
 */
export function cartOutcome(
  response: WalmartCartResponse,
  overflowIds: readonly string[] = [],
): CartOutcome {
  if (!response.configured) return { kind: 'unavailable' };
  if (!response.url || response.items.length === 0) return { kind: 'empty' };
  return { kind: 'opened', url: response.url, leftOut: [...response.skipped, ...overflowIds] };
}

/** One sentence for a cart that opened without some items, or null when nothing was left out. */
export function describeLeftOut(
  leftOut: readonly string[],
  names: Readonly<Record<string, string>>,
): string | null {
  if (leftOut.length === 0) return null;
  const labels = leftOut.map((id) => names[id] ?? id.replace(/[_-]+/g, ' '));
  if (labels.length === 1) return `${labels[0]} isn't in the Walmart cart. Add it yourself.`;
  if (labels.length <= 3) {
    return `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)} aren't in the Walmart cart.`;
  }
  return `${labels.length} items aren't in the Walmart cart. Check the list for what's left.`;
}
