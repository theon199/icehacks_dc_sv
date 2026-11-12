import type { PriceRequest, PricesResponse } from '@/lib/api/commerce';
import { ApiError } from '@/lib/api/errors';

import { loadPrices, PRICE_BATCH_SIZE } from './loadPrices';
import type { PriceCache } from './priceCache';
import { answer, priced } from './testing';

function fakeCache(initial: Record<string, ReturnType<typeof priced>> = {}) {
  const saved = { ...initial };
  const cache: PriceCache & { written: unknown[] } = {
    written: [],
    read: (ids) => Object.fromEntries(ids.filter((id) => saved[id]).map((id) => [id, saved[id]!])),
    write: (prices) => {
      cache.written.push(...prices);
    },
    clear: () => undefined,
  };
  return cache;
}

function response(prices: PricesResponse['prices'], extra: Partial<PricesResponse> = {}) {
  return { prices, pending: 0, retryAfterSeconds: null, notice: null, ...extra };
}

const items = (...ids: string[]) => ids.map((id) => ({ id, name: id }));

describe('loadPrices', () => {
  it('answers from the cache without asking the server', async () => {
    const fetchPrices = jest.fn();
    const cache = fakeCache({ flour: priced('flour', 400, 1, 'kg') });
    const snapshot = await loadPrices(items('flour'), { fetchPrices, cache });
    expect(fetchPrices).not.toHaveBeenCalled();
    expect(snapshot.prices.flour?.priceCents).toBe(400);
    expect(snapshot.failed).toBe(false);
  });

  it('asks only for what the cache does not have, and saves the answers', async () => {
    const fetchPrices = jest.fn(async (request: PriceRequest) =>
      response(request.items.map((i) => priced(i.id, 100, 1, 'each'))),
    );
    const cache = fakeCache({ flour: priced('flour', 400, 1, 'kg') });
    const snapshot = await loadPrices(items('flour', 'egg'), { fetchPrices, cache });
    expect(fetchPrices).toHaveBeenCalledWith({ items: [{ id: 'egg', name: 'egg' }] }, undefined);
    expect(Object.keys(snapshot.prices).sort()).toEqual(['egg', 'flour']);
    expect(cache.written).toHaveLength(1);
  });

  it('splits large requests into batches the server accepts', async () => {
    const fetchPrices = jest.fn(async (request: PriceRequest) =>
      response(request.items.map((i) => priced(i.id, 100, 1, 'each'))),
    );
    const ids = Array.from({ length: PRICE_BATCH_SIZE + 5 }, (_, i) => `item${i}`);
    const snapshot = await loadPrices(items(...ids), { fetchPrices, cache: fakeCache() });
    expect(fetchPrices).toHaveBeenCalledTimes(2);
    expect(fetchPrices.mock.calls[0]?.[0].items).toHaveLength(PRICE_BATCH_SIZE);
    expect(Object.keys(snapshot.prices)).toHaveLength(ids.length);
  });

  it('reports pending lookups and when to ask again', async () => {
    const fetchPrices = jest
      .fn()
      .mockResolvedValueOnce(response([answer('egg', 'pending')], { retryAfterSeconds: 5 }));
    const snapshot = await loadPrices(items('egg'), { fetchPrices, cache: fakeCache() });
    expect(snapshot.pendingIds).toEqual(['egg']);
    expect(snapshot.retryAfterSeconds).toBe(5);
  });

  it('passes on why lookups are paused', async () => {
    const fetchPrices = jest
      .fn()
      .mockResolvedValueOnce(response([answer('egg', 'unavailable')], { notice: 'daily_limit' }));
    const snapshot = await loadPrices(items('egg'), { fetchPrices, cache: fakeCache() });
    expect(snapshot.notice).toBe('daily_limit');
    expect(snapshot.pendingIds).toEqual([]);
  });

  it('keeps saved prices when the request fails', async () => {
    const fetchPrices = jest
      .fn()
      .mockRejectedValue(new ApiError({ kind: 'network', functionName: 'prices' }));
    const cache = fakeCache({ flour: priced('flour', 400, 1, 'kg') });
    const snapshot = await loadPrices(items('flour', 'egg'), { fetchPrices, cache });
    expect(snapshot.failed).toBe(true);
    expect(Object.keys(snapshot.prices)).toEqual(['flour']);
  });

  it('fails when nothing at all could be answered', async () => {
    const error = new ApiError({ kind: 'network', functionName: 'prices' });
    const fetchPrices = jest.fn().mockRejectedValue(error);
    await expect(loadPrices(items('egg'), { fetchPrices, cache: fakeCache() })).rejects.toBe(error);
  });

  it('ignores answers for ingredients it did not ask about', async () => {
    const fetchPrices = jest
      .fn()
      .mockResolvedValueOnce(
        response([priced('egg', 1, 1, 'each'), priced('other', 1, 1, 'each')]),
      );
    const snapshot = await loadPrices(items('egg'), { fetchPrices, cache: fakeCache() });
    expect(Object.keys(snapshot.prices)).toEqual(['egg']);
  });
});
