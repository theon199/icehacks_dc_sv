import { type z } from 'zod';

import { callFunction } from './client';
import {
  createWalmartCart,
  fetchIngredientPrices,
  fetchNearbyPlaces,
  fetchWalmartPrices,
  fetchWalmartStatus,
  nearbyResponseSchema,
  pricesResponseSchema,
  walmartCartResponseSchema,
  walmartPricesResponseSchema,
  walmartStatusSchema,
} from './commerce';

jest.mock('./client', () => ({ callFunction: jest.fn() }));

const mockedCall = jest.mocked(callFunction);

beforeEach(() => {
  mockedCall.mockReset();
  mockedCall.mockResolvedValue(undefined);
});

function lastCall() {
  const [name, input, , options] = mockedCall.mock.calls.at(-1) ?? [];
  return { name, input, options };
}

describe('fetchIngredientPrices', () => {
  it('sends validated items to the prices function', async () => {
    const signal = new AbortController().signal;
    await fetchIngredientPrices({ items: [{ id: 'chickpea', name: ' Chickpeas ' }] }, { signal });
    expect(lastCall()).toEqual({
      name: 'prices',
      input: { items: [{ id: 'chickpea', name: 'Chickpeas' }] },
      options: { signal },
    });
  });

  it('rejects invalid input before calling the server', () => {
    expect(() => fetchIngredientPrices({ items: [] })).toThrow();
    expect(() => fetchIngredientPrices({ items: [{ id: 'Not Valid', name: 'x' }] })).toThrow();
    expect(mockedCall).not.toHaveBeenCalled();
  });

  it('parses the response into camelCase', () => {
    const parsed = pricesResponseSchema.parse({
      prices: [
        {
          ingredient_id: 'chickpea',
          status: 'priced',
          price_cents: 129,
          currency: 'USD',
          package_qty: 15.5,
          unit: 'oz',
          retailer: 'Kroger',
          url: 'https://www.kroger.com/p/1',
          confidence: 'listed',
          fetched_at: '2026-11-12T10:00:00Z',
        },
        {
          ingredient_id: 'leek',
          status: 'pending',
          price_cents: null,
          currency: 'USD',
          package_qty: null,
          unit: null,
          retailer: null,
          url: null,
          confidence: null,
          fetched_at: null,
        },
      ],
      pending: 1,
      retry_after_seconds: 8,
      notice: null,
    });
    expect(parsed.retryAfterSeconds).toBe(8);
    expect(parsed.prices[0]).toMatchObject({
      ingredientId: 'chickpea',
      priceCents: 129,
      packageQty: 15.5,
    });
    expect(parsed.prices[1]?.status).toBe('pending');
  });
});

describe('walmart', () => {
  it('asks for status, prices and carts with the right actions', async () => {
    await fetchWalmartStatus();
    expect(lastCall().input).toEqual({ action: 'status' });
    await fetchWalmartPrices(['leek', 'kale']);
    expect(lastCall().input).toEqual({ action: 'prices', ingredient_ids: ['leek', 'kale'] });
    await createWalmartCart({ items: [{ ingredient_id: 'leek', quantity: 2 }] });
    expect(lastCall()).toMatchObject({
      name: 'walmart',
      input: { action: 'cart', items: [{ ingredient_id: 'leek', quantity: 2 }] },
    });
  });

  it('enforces the 25-item cart limit locally', () => {
    const items = Array.from({ length: 26 }, (_, i) => ({ ingredient_id: `i${i}`, quantity: 1 }));
    expect(() => createWalmartCart({ items })).toThrow();
  });

  it('accepts the not-configured answer for every action', () => {
    const schemas: z.ZodType<unknown>[] = [
      walmartStatusSchema,
      walmartPricesResponseSchema,
      walmartCartResponseSchema,
    ];
    for (const schema of schemas) {
      expect(schema.parse({ configured: false })).toEqual({ configured: false });
    }
  });

  it('parses a cart link and refuses non-https links', () => {
    const cart = {
      configured: true,
      affiliate: false,
      url: 'https://affil.walmart.com/cart/addToCart?items=111|2',
      items: [{ ingredient_id: 'leek', item_id: '111', quantity: 2 }],
      skipped: ['saffron'],
    };
    expect(walmartCartResponseSchema.parse(cart)).toMatchObject({
      items: [{ ingredientId: 'leek', itemId: '111', quantity: 2 }],
    });
    expect(() =>
      walmartCartResponseSchema.parse({ ...cart, url: 'javascript:alert(1)' }),
    ).toThrow();
  });
});

describe('fetchNearbyPlaces', () => {
  it('maps the request to the wire format', async () => {
    await fetchNearbyPlaces({
      dish: 'Pad thai',
      dishKey: 'pad-thai',
      lat: 1,
      lng: 2,
      radiusM: 3000,
    });
    expect(lastCall()).toEqual({
      name: 'places',
      input: { dish: 'Pad thai', dish_key: 'pad-thai', lat: 1, lng: 2, radius_m: 3000 },
      options: undefined,
    });
  });

  it('rejects a radius over 8 km', () => {
    expect(() =>
      fetchNearbyPlaces({ dish: 'Pad thai', dishKey: 'pad-thai', lat: 1, lng: 2, radiusM: 9000 }),
    ).toThrow();
  });

  it('parses ranked places', () => {
    const parsed = nearbyResponseSchema.parse({
      configured: true,
      cached: true,
      fetched_at: '2026-11-12T10:00:00Z',
      notice: null,
      places: [
        {
          id: 'p1',
          name: 'Thai Basil',
          address: '1 Main St',
          lat: 1,
          lng: 2,
          distance_m: 420,
          rating: 4.5,
          rating_count: 210,
          price_level: 2,
          open_now: true,
          primary_type: 'thai_restaurant',
          yes_count: 3,
          no_count: 0,
          my_answer: null,
          score: 1.12,
        },
      ],
    });
    expect(parsed.places[0]).toMatchObject({ distanceM: 420, yesCount: 3, openNow: true });
  });
});
