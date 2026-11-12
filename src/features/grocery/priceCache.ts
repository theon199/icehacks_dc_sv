/**
 * On-device cache of price answers, so a recipe or list priced once shows its estimate instantly
 * (and offline) when it is opened again.
 *
 * Only settled answers are kept: `priced` for 7 days and `not_found` for 3 (a store may start
 * listing the item, so "no price" is asked about again sooner). Age counts from when the price
 * was checked (`fetchedAt`), not from when this device saved it: a price the server had already
 * held for days is not given a fresh week here. `pending` and `unavailable` describe a moment,
 * not a price, so they are always asked for again.
 *
 * The stored map is read from disk once, then served from memory; writes update memory at once
 * and reach disk asynchronously. Entries are validated one by one as they are first read, not all
 * at launch: checking a full cache of 600 entries up front costs tens of milliseconds on an
 * interpreter without a JIT, on the first render of whichever screen asks first. An entry that
 * fails validation is ignored on its own instead of discarding the whole cache.
 * Prices are not personal data, so the cache survives sign-out.
 */
import { z } from 'zod';

import type { IngredientPrice } from '@/lib/api/commerce';
import { describeError, logger } from '@/lib/logger';
import { defineKvKey, type KvKey } from '@/lib/storage/kv';

const DAY_MS = 86_400_000;
/** How long a priced answer is served from the device. */
export const PRICE_CACHE_TTL_MS = 7 * DAY_MS;
/** How long a "no store price found" answer is served from the device. */
export const NOT_FOUND_TTL_MS = 3 * DAY_MS;
/** Enough for several weeks of planned meals; the oldest entries go first beyond this. */
export const PRICE_CACHE_MAX_ENTRIES = 600;

const nullableText = z.string().max(2048).nullable();

const cachedPriceSchema = z.object({
  ingredientId: z.string().min(1).max(80),
  status: z.enum(['priced', 'not_found']),
  priceCents: z.number().int().nonnegative().nullable(),
  currency: z.string().min(1).max(8),
  packageQty: z.number().positive().nullable(),
  unit: z.string().max(24).nullable(),
  retailer: nullableText,
  url: nullableText,
  confidence: z.enum(['listed', 'estimated']).nullable(),
  fetchedAt: z.string().max(64).nullable(),
});

const cacheEntrySchema = z.object({ price: cachedPriceSchema, savedAt: z.number() });
export type PriceCacheEntry = z.infer<typeof cacheEntrySchema>;

/** What storage holds: a map by ingredient id whose entries are checked lazily. */
const storedSchema = z.record(z.string(), z.unknown());
export type StoredPrices = z.infer<typeof storedSchema>;
export type PriceCacheMap = Readonly<Record<string, PriceCacheEntry>>;

/** The stored entry for `id`, or null when it is absent or not a valid entry for that id. */
export function parseEntry(id: string, value: unknown): PriceCacheEntry | null {
  if (value === undefined) return null;
  const parsed = cacheEntrySchema.safeParse(value);
  return parsed.success && parsed.data.price.ingredientId === id ? parsed.data : null;
}

/** Whether an answer is worth keeping across launches. */
export function isCacheable(
  price: IngredientPrice,
): price is IngredientPrice & { status: 'priced' | 'not_found' } {
  return price.status === 'priced' || price.status === 'not_found';
}

/**
 * When the answer's age starts: the check time when the server sent one, capped at the save time
 * so a server clock running ahead of the device cannot stretch the window.
 */
function checkedAt(entry: PriceCacheEntry): number {
  const fetched = entry.price.fetchedAt ? Date.parse(entry.price.fetchedAt) : Number.NaN;
  return Number.isFinite(fetched) ? Math.min(fetched, entry.savedAt) : entry.savedAt;
}

export function isFresh(entry: PriceCacheEntry, now: number): boolean {
  // An entry saved "in the future" means the clock moved back; it is not trusted.
  if (entry.savedAt > now) return false;
  const ttl = entry.price.status === 'not_found' ? NOT_FOUND_TTL_MS : PRICE_CACHE_TTL_MS;
  return now - checkedAt(entry) < ttl;
}

/** Fresh cached answers for the given ids. */
export function pickFresh(
  map: PriceCacheMap,
  ids: readonly string[],
  now: number,
): Record<string, IngredientPrice> {
  const out: Record<string, IngredientPrice> = {};
  for (const id of ids) {
    const entry = map[id];
    if (entry && isFresh(entry, now)) out[id] = entry.price;
  }
  return out;
}

/**
 * The map with new answers stored, expired entries dropped and the size capped (newest kept).
 * Returns the same map when nothing changes.
 */
export function mergeIntoCache(
  map: PriceCacheMap,
  prices: readonly IngredientPrice[],
  now: number,
  maxEntries = PRICE_CACHE_MAX_ENTRIES,
): PriceCacheMap {
  // Answers that are already too old to serve are not worth a slot.
  const incoming = prices
    .filter(isCacheable)
    .map((price): PriceCacheEntry => ({ price, savedAt: now }))
    .filter((entry) => isFresh(entry, now));
  const entries = Object.entries(map).filter(([, entry]) => isFresh(entry, now));
  if (incoming.length === 0 && entries.length === Object.keys(map).length) return map;
  const next = new Map(entries);
  for (const entry of incoming) next.set(entry.price.ingredientId, entry);
  const kept = [...next].sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, maxEntries);
  return Object.fromEntries(kept);
}

export interface PriceCache {
  /** Fresh answers for these ids. */
  read(ids: readonly string[], now?: number): Record<string, IngredientPrice>;
  /** Stores settled answers; others are ignored. */
  write(prices: readonly IngredientPrice[], now?: number): void;
  clear(): void;
}

export function createPriceCache(key: KvKey<StoredPrices>): PriceCache {
  /** The map as storage returned it; entries are unchecked. */
  let stored: Readonly<StoredPrices> | null = null;
  /** Entries checked so far, by id (null: absent or invalid). */
  const checked = new Map<string, PriceCacheEntry | null>();
  /** Every valid entry, once a write has needed them all. */
  let all: PriceCacheMap | null = null;
  let writing: Promise<void> = Promise.resolve();

  function load(): Readonly<StoredPrices> {
    if (stored) return stored;
    try {
      stored = key.getSync() ?? {};
    } catch (error) {
      logger.warn('Price cache could not be read', describeError(error));
      stored = {};
    }
    return stored;
  }

  function entryFor(id: string): PriceCacheEntry | null {
    if (all) return Object.prototype.hasOwnProperty.call(all, id) ? (all[id] ?? null) : null;
    const known = checked.get(id);
    if (known !== undefined) return known;
    const map = load();
    const entry = Object.prototype.hasOwnProperty.call(map, id) ? parseEntry(id, map[id]) : null;
    checked.set(id, entry);
    return entry;
  }

  function everything(): PriceCacheMap {
    if (all) return all;
    const out: Record<string, PriceCacheEntry> = {};
    for (const id of Object.keys(load())) {
      const entry = entryFor(id);
      if (entry) out[id] = entry;
    }
    replace(out);
    return out;
  }

  function replace(map: PriceCacheMap) {
    all = map;
    stored = map;
    checked.clear();
  }

  function persist(map: PriceCacheMap) {
    const snapshot = { ...map };
    // Writes are chained so a stale snapshot can never land after a fresher one.
    writing = writing
      .then(() => key.set(snapshot))
      .catch((error: unknown) => {
        logger.warn('Price cache could not be saved', describeError(error));
      });
  }

  return {
    read(ids, now = Date.now()) {
      const out: Record<string, IngredientPrice> = {};
      for (const id of ids) {
        const entry = entryFor(id);
        if (entry && isFresh(entry, now)) out[id] = entry.price;
      }
      return out;
    },
    write(prices, now = Date.now()) {
      // Nothing worth keeping: skip the full pass over stored entries a merge needs.
      if (!prices.some(isCacheable)) return;
      const current = everything();
      const next = mergeIntoCache(current, prices, now);
      if (next === current) return;
      replace(next);
      persist(next);
    },
    clear() {
      replace({});
      persist({});
    },
  };
}

/** The app's price cache. */
export const priceCache = createPriceCache(defineKvKey('grocery.prices', storedSchema));
