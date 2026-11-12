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

/** What has already been learned about a set of ingredient ids, without a new lookup. */
export interface KnownReadiness {
  /** Ids with a cart-ready item. */
  readonly ready: ReadonlySet<string>;
  /** Ids nobody has asked about recently. */
  readonly unknown: readonly string[];
}

/**
 * The button shows when the integration reports itself configured and some ingredient that
 * still needs buying is either known to be cart-ready or not yet asked about. Availability is
 * only looked up when the shopper taps, so viewing a recipe never spends the Walmart allowance;
 * once a lookup has found nothing cart-ready, the button stays hidden for that set.
 */
export function shouldShowWalmart(
  status: WalmartStatus | undefined,
  idsToBuy: readonly string[],
  known: KnownReadiness,
): boolean {
  if (status?.configured !== true || idsToBuy.length === 0) return false;
  return idsToBuy.some((id) => known.ready.has(id) || known.unknown.includes(id));
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
