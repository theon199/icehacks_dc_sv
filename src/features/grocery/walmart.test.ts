import type { WalmartPrice } from '@/lib/api/commerce';

import { openWalmartCart } from './useWalmart';
import {
  cartOutcome,
  cartReadyIds,
  describeLeftOut,
  MAX_CART_LINES,
  planCart,
  shouldShowWalmart,
} from './walmart';
import { createWalmartReadiness } from './walmartReadiness';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

function walmartPrice(
  ingredientId: string,
  status: WalmartPrice['status'],
  available = true,
): WalmartPrice {
  const found = status === 'found';
  return {
    ingredientId,
    itemId: status === 'unmapped' ? null : `w-${ingredientId}`,
    status,
    name: found ? ingredientId : null,
    priceCents: found ? 199 : null,
    size: null,
    available: found && available,
    url: null,
    image: null,
  };
}

describe('cartReadyIds', () => {
  it('keeps only mapped, listed, in-stock items', () => {
    const ready = cartReadyIds([
      walmartPrice('flour', 'found'),
      walmartPrice('egg', 'found', false),
      walmartPrice('milk', 'not_found'),
      walmartPrice('tahini', 'unmapped'),
    ]);
    expect([...ready]).toEqual(['flour']);
  });
});

describe('shouldShowWalmart', () => {
  const status = { configured: true, affiliate: false } as const;
  const known = (ready: string[], unknown: string[] = []) => ({ ready: new Set(ready), unknown });

  it('shows when configured and an item to buy is cart-ready', () => {
    expect(shouldShowWalmart(status, ['egg', 'flour'], known(['flour']))).toBe(true);
  });

  it('shows before anything has been looked up, so viewing alone costs no lookup', () => {
    expect(shouldShowWalmart(status, ['egg', 'flour'], known([], ['egg', 'flour']))).toBe(true);
  });

  it('hides when the integration is not configured', () => {
    expect(shouldShowWalmart({ configured: false }, ['flour'], known(['flour']))).toBe(false);
    expect(shouldShowWalmart(undefined, ['flour'], known([], ['flour']))).toBe(false);
  });

  it('hides once a lookup found nothing to buy that is cart-ready', () => {
    expect(shouldShowWalmart(status, ['egg'], known(['flour']))).toBe(false);
    expect(shouldShowWalmart(status, [], known(['flour'], ['egg']))).toBe(false);
  });
});

describe('planCart', () => {
  it('adds one of each cart-ready item, in order', () => {
    expect(planCart(['egg', 'flour', 'milk', 'flour'], new Set(['flour', 'milk']))).toEqual({
      request: {
        items: [
          { ingredient_id: 'flour', quantity: 1 },
          { ingredient_id: 'milk', quantity: 1 },
        ],
      },
      overflowIds: [],
    });
  });

  it('caps a cart at the line limit and reports the rest', () => {
    const ids = Array.from({ length: MAX_CART_LINES + 2 }, (_, i) => `item${i}`);
    const plan = planCart(ids, new Set(ids));
    expect(plan?.request.items).toHaveLength(MAX_CART_LINES);
    expect(plan?.overflowIds).toEqual([`item${MAX_CART_LINES}`, `item${MAX_CART_LINES + 1}`]);
  });

  it('has no plan when nothing is ready', () => {
    expect(planCart(['egg'], new Set())).toBeNull();
  });
});

describe('cartOutcome', () => {
  const cart = {
    configured: true as const,
    affiliate: true,
    url: 'https://www.walmart.com/cart?items=1',
    items: [{ ingredientId: 'flour', itemId: 'w-flour', quantity: 1 }],
    skipped: ['milk'],
  };

  it('opens the cart and names everything left out', () => {
    expect(cartOutcome(cart, ['extra'])).toEqual({
      kind: 'opened',
      url: cart.url,
      leftOut: ['milk', 'extra'],
    });
  });

  it('reports an empty cart and a missing integration', () => {
    expect(cartOutcome({ ...cart, url: null, items: [] })).toEqual({ kind: 'empty' });
    expect(cartOutcome({ configured: false })).toEqual({ kind: 'unavailable' });
  });
});

describe('describeLeftOut', () => {
  const names = { milk: 'milk', egg: 'egg', tahini: 'tahini' };

  it('says which items the cart does not hold', () => {
    expect(describeLeftOut([], names)).toBeNull();
    expect(describeLeftOut(['milk'], names)).toBe(
      "milk isn't in the Walmart cart. Add it yourself.",
    );
    expect(describeLeftOut(['milk', 'egg', 'tahini'], names)).toBe(
      "milk, egg and tahini aren't in the Walmart cart.",
    );
    expect(describeLeftOut(['a', 'b', 'c', 'd'], {})).toBe(
      "4 items aren't in the Walmart cart. Check the list for what's left.",
    );
    expect(describeLeftOut(['sun_dried-tomato'], {})).toMatch(/^sun dried tomato isn't/);
  });
});

describe('openWalmartCart', () => {
  const cartAnswer = {
    configured: true as const,
    affiliate: false,
    url: 'https://www.walmart.com/cart?items=1',
    items: [{ ingredientId: 'flour', itemId: 'w', quantity: 1 }],
    skipped: [],
  };

  function pricesFor(statuses: Record<string, WalmartPrice['status']>) {
    return jest.fn(async (ids: readonly string[]) => ({
      configured: true as const,
      prices: ids.map((id) => walmartPrice(id, statuses[id] ?? 'unmapped')),
    }));
  }

  it('looks up the items, builds a cart of the ready ones and opens its link', async () => {
    const fetchPrices = pricesFor({ flour: 'found' });
    const createCart = jest.fn().mockResolvedValue(cartAnswer);
    const openUrl = jest.fn().mockResolvedValue(undefined);
    const outcome = await openWalmartCart(
      { idsToBuy: ['egg', 'flour'] },
      { fetchPrices, createCart, openUrl, readiness: createWalmartReadiness() },
    );
    expect(fetchPrices).toHaveBeenCalledWith(['egg', 'flour']);
    expect(createCart).toHaveBeenCalledWith({ items: [{ ingredient_id: 'flour', quantity: 1 }] });
    expect(openUrl).toHaveBeenCalledWith('https://www.walmart.com/cart?items=1');
    expect(outcome.kind).toBe('opened');
  });

  it('reuses recent answers instead of looking up again', async () => {
    const readiness = createWalmartReadiness();
    const fetchPrices = pricesFor({ flour: 'found' });
    const createCart = jest.fn().mockResolvedValue(cartAnswer);
    const deps = { fetchPrices, createCart, openUrl: jest.fn(), readiness };
    await openWalmartCart({ idsToBuy: ['flour'] }, deps);
    await openWalmartCart({ idsToBuy: ['flour'] }, deps);
    expect(fetchPrices).toHaveBeenCalledTimes(1);
    expect(createCart).toHaveBeenCalledTimes(2);
  });

  it('opens nothing when no cart could be built', async () => {
    const createCart = jest.fn();
    const openUrl = jest.fn();
    const outcome = await openWalmartCart(
      { idsToBuy: ['egg'] },
      {
        fetchPrices: pricesFor({ egg: 'not_found' }),
        createCart,
        openUrl,
        readiness: createWalmartReadiness(),
      },
    );
    expect(outcome).toEqual({ kind: 'empty' });
    expect(createCart).not.toHaveBeenCalled();
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('reports a missing integration without building a cart', async () => {
    const createCart = jest.fn();
    const outcome = await openWalmartCart(
      { idsToBuy: ['egg'] },
      {
        fetchPrices: jest.fn().mockResolvedValue({ configured: false }),
        createCart,
        readiness: createWalmartReadiness(),
      },
    );
    expect(outcome).toEqual({ kind: 'unavailable' });
    expect(createCart).not.toHaveBeenCalled();
  });
});
