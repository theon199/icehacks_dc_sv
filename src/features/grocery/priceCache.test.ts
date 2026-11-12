import type { IngredientPrice } from '@/lib/api/commerce';
import type { KvKey } from '@/lib/storage/kv';

import {
  createPriceCache,
  mergeIntoCache,
  NOT_FOUND_TTL_MS,
  parseEntry,
  pickFresh,
  PRICE_CACHE_TTL_MS,
  type StoredPrices,
} from './priceCache';
import { answer as fixtureAnswer, priced as fixturePriced } from './testing';

const NOW = Date.parse('2026-11-10T12:00:00.000Z');
const DAY = 86_400_000;
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

/** A priced answer checked at `NOW` unless the test says otherwise. */
function priced(
  id: string,
  cents: number,
  qty: number | null,
  unit: string,
  extra: Partial<IngredientPrice> = {},
): IngredientPrice {
  return fixturePriced(id, cents, qty, unit, { fetchedAt: iso(NOW), ...extra });
}

function answer(id: string, status: 'pending' | 'not_found' | 'unavailable'): IngredientPrice {
  const base = fixtureAnswer(id, status);
  return status === 'not_found' ? { ...base, fetchedAt: iso(NOW) } : base;
}

function memoryKey(initial: StoredPrices | null = null) {
  let stored: StoredPrices | null = initial;
  const key = {
    name: 'test',
    get: jest.fn(async () => stored),
    set: jest.fn(async (value: StoredPrices) => {
      stored = value;
    }),
    remove: jest.fn(async () => {
      stored = null;
    }),
    getSync: jest.fn(() => stored),
    setSync: jest.fn((value: StoredPrices) => {
      stored = value;
    }),
  };
  return {
    key: key as unknown as KvKey<StoredPrices>,
    spy: key,
    stored: () => stored,
  };
}

async function flushWrites() {
  await Promise.resolve();
  await Promise.resolve();
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

  it('forgets answers checked more than 7 days ago', () => {
    const then = NOW - 8 * DAY;
    const old = mergeIntoCache({}, [priced('flour', 400, 1, 'kg', { fetchedAt: iso(then) })], then);
    const next = mergeIntoCache(old, [priced('egg', 360, 12, 'each')], NOW);
    expect(Object.keys(next)).toEqual(['egg']);
  });

  it('does not store answers that are already too old to serve', () => {
    const stale = priced('flour', 400, 1, 'kg', { fetchedAt: iso(NOW - 8 * DAY) });
    expect(mergeIntoCache({}, [stale], NOW)).toEqual({});
  });

  it('keeps the newest entries when full', () => {
    let map = mergeIntoCache({}, [priced('a', 1, 1, 'each')], NOW - 3000, 2);
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
  it('serves prices checked within the last 7 days', () => {
    const map = mergeIntoCache({}, [priced('flour', 400, 1, 'kg')], NOW);
    expect(pickFresh(map, ['flour', 'egg'], NOW + 6 * DAY)).toHaveProperty('flour');
    expect(pickFresh(map, ['flour'], NOW + PRICE_CACHE_TTL_MS)).toEqual({});
    // An entry from the future (clock moved back) is not trusted.
    expect(pickFresh(map, ['flour'], NOW - DAY)).toEqual({});
  });

  it('serves "no store price" answers for 3 days at most', () => {
    expect(NOT_FOUND_TTL_MS).toBeLessThanOrEqual(3 * DAY);
    const map = mergeIntoCache({}, [answer('sumac', 'not_found')], NOW);
    expect(pickFresh(map, ['sumac'], NOW + 3 * DAY - HOUR)).toHaveProperty('sumac');
    expect(pickFresh(map, ['sumac'], NOW + 3 * DAY)).toEqual({});
  });

  it('counts age from when the price was checked, not when it was saved here', () => {
    // The server had held this price for 6 days when this device first saw it.
    const checkedEarlier = priced('flour', 400, 1, 'kg', { fetchedAt: iso(NOW - 6 * DAY) });
    const map = mergeIntoCache({}, [checkedEarlier], NOW);
    expect(pickFresh(map, ['flour'], NOW + 12 * HOUR)).toHaveProperty('flour');
    expect(pickFresh(map, ['flour'], NOW + DAY)).toEqual({});
  });

  it('falls back to the save time without a usable check time', () => {
    const undated = priced('flour', 400, 1, 'kg', { fetchedAt: null });
    const garbled = priced('egg', 360, 12, 'each', { fetchedAt: 'yesterday-ish' });
    const map = mergeIntoCache({}, [undated, garbled], NOW);
    const fresh = pickFresh(map, ['flour', 'egg'], NOW + 6 * DAY);
    expect(Object.keys(fresh).sort()).toEqual(['egg', 'flour']);
  });

  it('does not let a check time ahead of the device clock stretch the window', () => {
    const ahead = priced('flour', 400, 1, 'kg', { fetchedAt: iso(NOW + 2 * DAY) });
    const map = mergeIntoCache({}, [ahead], NOW);
    expect(pickFresh(map, ['flour'], NOW + PRICE_CACHE_TTL_MS)).toEqual({});
  });
});

describe('parseEntry', () => {
  it('accepts a valid entry stored under its own id only', () => {
    const entry = { price: priced('flour', 400, 1, 'kg'), savedAt: NOW };
    expect(parseEntry('flour', entry)).toEqual(entry);
    expect(parseEntry('egg', entry)).toBeNull();
    expect(parseEntry('flour', { price: { ingredientId: 'flour' }, savedAt: NOW })).toBeNull();
    expect(parseEntry('flour', undefined)).toBeNull();
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
    await flushWrites();
    expect(Object.keys(current() ?? {}).sort()).toEqual(['egg', 'flour']);
  });

  it('validates entries as they are read and ignores a broken one on its own', () => {
    const good = mergeIntoCache({}, [priced('flour', 400, 1, 'kg')], NOW);
    const { key } = memoryKey({ ...good, egg: { price: 'corrupted', savedAt: NOW } });
    const cache = createPriceCache(key);
    expect(cache.read(['flour', 'egg'], NOW)).toEqual({ flour: good.flour?.price });
  });

  it('keeps valid stored entries and drops broken ones on the next write', async () => {
    const good = mergeIntoCache({}, [priced('flour', 400, 1, 'kg')], NOW);
    const { key, stored } = memoryKey({ ...good, egg: { price: 'corrupted', savedAt: NOW } });
    const cache = createPriceCache(key);
    cache.write([priced('milk', 120, 1, 'l')], NOW);
    const read = cache.read(['flour', 'milk', 'egg'], NOW);
    expect(Object.keys(read).sort()).toEqual(['flour', 'milk']);
    await flushWrites();
    expect(Object.keys(stored() ?? {}).sort()).toEqual(['flour', 'milk']);
  });

  it('does not read inherited object keys as entries', () => {
    const { key } = memoryKey({});
    expect(createPriceCache(key).read(['constructor', '__proto__'], NOW)).toEqual({});
  });

  it('skips writes that change nothing', async () => {
    const { key, spy } = memoryKey();
    const cache = createPriceCache(key);
    cache.write([answer('egg', 'pending')], NOW);
    await flushWrites();
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
    await flushWrites();
    expect(stored()).toEqual({});
  });
});
