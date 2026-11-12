import type { KvKey } from '@/lib/storage/kv';

import {
  createPriceCache,
  mergeIntoCache,
  pickFresh,
  PRICE_CACHE_TTL_MS,
  type PriceCacheMap,
} from './priceCache';
import { answer, priced } from './testing';

const NOW = Date.parse('2026-11-10T12:00:00.000Z');
const DAY = 86_400_000;

function memoryKey(initial: PriceCacheMap | null = null) {
  let stored: PriceCacheMap | null = initial;
  const key = {
    name: 'test',
    get: jest.fn(async () => stored),
    set: jest.fn(async (value: PriceCacheMap) => {
      stored = value;
    }),
    remove: jest.fn(async () => {
      stored = null;
    }),
    getSync: jest.fn(() => stored),
    setSync: jest.fn((value: PriceCacheMap) => {
      stored = value;
    }),
  };
  return {
    key: key as unknown as KvKey<Record<string, PriceCacheMap[string]>>,
    spy: key,
    stored: () => stored,
  };
}

describe('mergeIntoCache', () => {
  it('keeps priced and not-found answers only', () => {
    const map = mergeIntoCache(
      {},
      [priced('flour', 400, 1, 'kg'), answer('egg', 'not_found'), answer('milk', 'pending')],
      NOW,
    );
    expect(Object.keys(map).sort()).toEqual(['egg', 'flour']);
    expect(map.flour?.savedAt).toBe(NOW);
  });

  it('forgets answers saved more than 7 days ago', () => {
    const old = mergeIntoCache({}, [priced('flour', 400, 1, 'kg')], NOW - 8 * DAY);
    const next = mergeIntoCache(old, [priced('egg', 360, 12, 'each')], NOW);
    expect(Object.keys(next)).toEqual(['egg']);
  });

  it('keeps the newest entries when full', () => {
    let map: PriceCacheMap = {};
    map = mergeIntoCache(map, [priced('a', 1, 1, 'each')], NOW - 3000, 2);
    map = mergeIntoCache(map, [priced('b', 1, 1, 'each')], NOW - 2000, 2);
    map = mergeIntoCache(map, [priced('c', 1, 1, 'each')], NOW - 1000, 2);
    expect(Object.keys(map).sort()).toEqual(['b', 'c']);
  });

  it('returns the same map when nothing changes', () => {
    const map = mergeIntoCache({}, [priced('a', 1, 1, 'each')], NOW);
    expect(mergeIntoCache(map, [answer('b', 'pending')], NOW)).toBe(map);
  });
});

describe('pickFresh', () => {
  it('serves answers saved within the last 7 days', () => {
    const map = mergeIntoCache({}, [priced('flour', 400, 1, 'kg')], NOW);
    expect(pickFresh(map, ['flour', 'egg'], NOW + 6 * DAY)).toHaveProperty('flour');
    expect(pickFresh(map, ['flour'], NOW + PRICE_CACHE_TTL_MS)).toEqual({});
    // An entry from the future (clock moved back) is not trusted.
    expect(pickFresh(map, ['flour'], NOW - DAY)).toEqual({});
  });
});

describe('createPriceCache', () => {
  it('reads storage once and writes through asynchronously', async () => {
    const stored = mergeIntoCache({}, [priced('flour', 400, 1, 'kg')], NOW);
    const { key, spy, stored: current } = memoryKey(stored);
    const cache = createPriceCache(key);
    expect(cache.read(['flour'], NOW)).toHaveProperty('flour.priceCents', 400);
    cache.read(['flour'], NOW);
    expect(spy.getSync).toHaveBeenCalledTimes(1);

    cache.write([priced('egg', 360, 12, 'each')], NOW);
    expect(cache.read(['egg'], NOW)).toHaveProperty('egg');
    await Promise.resolve();
    await Promise.resolve();
    expect(Object.keys(current() ?? {}).sort()).toEqual(['egg', 'flour']);
  });

  it('skips writes that change nothing', async () => {
    const { key, spy } = memoryKey();
    const cache = createPriceCache(key);
    cache.write([answer('egg', 'pending')], NOW);
    await Promise.resolve();
    expect(spy.set).not.toHaveBeenCalled();
  });

  it('starts empty when storage cannot be read', () => {
    const { key, spy } = memoryKey();
    spy.getSync.mockImplementation(() => {
      throw new Error('disk');
    });
    expect(createPriceCache(key).read(['flour'], NOW)).toEqual({});
  });

  it('can be cleared', async () => {
    const { key, stored } = memoryKey(mergeIntoCache({}, [priced('flour', 1, 1, 'kg')], NOW));
    const cache = createPriceCache(key);
    cache.clear();
    expect(cache.read(['flour'], NOW)).toEqual({});
    await Promise.resolve();
    await Promise.resolve();
    expect(stored()).toEqual({});
  });
});
