import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useSessionStore } from '@/features/auth';
import { fetchIngredientPrices, type PriceRequest } from '@/lib/api/commerce';
import { getIngredients } from '@/lib/catalog/queries';

import { priceCache } from './priceCache';
import { answer, CATALOG_INGREDIENTS, priced } from './testing';
import {
  MAX_PRICE_POLLS,
  nextPoll,
  nextPollDelay,
  normalizeIngredientIds,
  usePrices,
  type PolledPrices,
} from './usePrices';

jest.mock('@/lib/catalog/queries', () => ({ getIngredients: jest.fn() }));
jest.mock('@/lib/api/commerce', () => ({ fetchIngredientPrices: jest.fn() }));

const clients: QueryClient[] = [];

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  priceCache.clear();
  useSessionStore.setState({ status: 'ready', userId: 'u1' });
  jest
    .mocked(getIngredients)
    .mockImplementation(async (ids) => CATALOG_INGREDIENTS.filter((i) => ids.includes(i.id)));
});

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});

function snapshot(extra: Partial<PolledPrices>): PolledPrices {
  return {
    prices: {},
    pendingIds: [],
    retryAfterSeconds: null,
    notice: null,
    failed: false,
    poll: 1,
    at: 0,
    ...extra,
  };
}

describe('polling rules', () => {
  it('polls at the pace the server asks, within bounds', () => {
    expect(nextPollDelay(snapshot({ pendingIds: ['egg'], retryAfterSeconds: 8 }))).toBe(8000);
    expect(nextPollDelay(snapshot({ pendingIds: ['egg'], retryAfterSeconds: 1 }))).toBe(3000);
    expect(nextPollDelay(snapshot({ pendingIds: ['egg'], retryAfterSeconds: 600 }))).toBe(60_000);
  });

  it('stops when nothing is pending or the round is used up', () => {
    expect(nextPollDelay(snapshot({}))).toBe(false);
    expect(nextPollDelay(snapshot({ pendingIds: ['egg'], poll: MAX_PRICE_POLLS }))).toBe(false);
    expect(nextPollDelay(undefined)).toBe(false);
  });

  it('counts polls within a round and starts a new round after a quiet spell', () => {
    const pending = snapshot({ pendingIds: ['egg'], poll: 3, at: 1000 });
    expect(nextPoll(pending, 2000)).toBe(4);
    expect(nextPoll(pending, 1000 + 6 * 60_000)).toBe(1);
    expect(nextPoll(snapshot({ poll: 5 }), 2000)).toBe(1);
    expect(nextPoll(undefined, 2000)).toBe(1);
  });

  it('normalises ids', () => {
    expect(normalizeIngredientIds(['egg', 'flour', 'egg', 'Bad Id', ''])).toEqual(['egg', 'flour']);
  });
});

describe('usePrices', () => {
  it('fetches prices for catalog ingredients by name', async () => {
    jest.mocked(fetchIngredientPrices).mockImplementation(async (request: PriceRequest) => ({
      prices: request.items.map((i) => priced(i.id, 100, 1, 'each')),
      pending: 0,
      retryAfterSeconds: null,
      notice: null,
    }));
    const { result } = await renderHook(() => usePrices(['flour', 'egg', 'flour']), {
      wrapper: wrapper(),
    });
    await waitFor(() =>
      expect(Object.keys(result.current.prices).sort()).toEqual(['egg', 'flour']),
    );
    expect(fetchIngredientPrices).toHaveBeenCalledTimes(1);
    const request = jest.mocked(fetchIngredientPrices).mock.calls[0]?.[0];
    expect(request?.items.map((i) => i.name).sort()).toEqual(['egg', 'flour']);
    expect(result.current.lookupStopped).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('shows saved prices only while signed out', async () => {
    useSessionStore.setState({ status: 'signedOut', userId: null });
    // Checked just now, so it is within the cache's freshness window.
    priceCache.write([priced('flour', 400, 1, 'kg', { fetchedAt: new Date().toISOString() })]);
    const { result } = await renderHook(() => usePrices(['flour', 'egg']), { wrapper: wrapper() });
    expect(result.current.prices.flour?.priceCents).toBe(400);
    await waitFor(() => expect(result.current.lookupStopped).toBe(true));
    expect(fetchIngredientPrices).not.toHaveBeenCalled();
  });

  it('asks again while a price is pending', async () => {
    jest
      .mocked(fetchIngredientPrices)
      .mockResolvedValueOnce({
        prices: [answer('egg', 'pending')],
        pending: 1,
        retryAfterSeconds: 1,
        notice: null,
      })
      .mockResolvedValue({
        prices: [priced('egg', 360, 12, 'each')],
        pending: 0,
        retryAfterSeconds: null,
        notice: null,
      });
    const { result } = await renderHook(() => usePrices(['egg']), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.pendingIds).toEqual(['egg']));
    await waitFor(() => expect(result.current.prices.egg?.status).toBe('priced'), {
      timeout: 6000,
    });
    expect(fetchIngredientPrices).toHaveBeenCalledTimes(2);
  });

  it('reports a failed lookup', async () => {
    jest.mocked(fetchIngredientPrices).mockRejectedValue(new Error('offline'));
    const { result } = await renderHook(() => usePrices(['egg']), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.lookupStopped).toBe(true);
    expect(result.current.prices).toEqual({});
  });
});
