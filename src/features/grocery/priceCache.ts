/**
 * On-device cache of price answers, kept for 7 days so a recipe or list priced once shows its
 * estimate instantly (and offline) when it is opened again.
 *
 * Only settled answers are kept: `priced` and `not_found`. `pending` and `unavailable` describe
 * a moment, not a price, so they are always asked for again. The stored map is read from disk
 * once, then served from memory; writes update memory at once and reach disk asynchronously.
 * Prices are not personal data, so the cache survives sign-out.
 */
import { z } from 'zod';

import type { IngredientPrice } from '@/lib/api/commerce';
import { describeError, logger } from '@/lib/logger';
import { defineKvKey, type KvKey } from '@/lib/storage/kv';

export const PRICE_CACHE_TTL_MS = 7 * 86_400_000;
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

const cacheSchema = z.record(z.string(), cacheEntrySchema);
export type PriceCacheMap = Readonly<Record<string, PriceCacheEntry>>;

/** Whether an answer is worth keeping across launches. */
export function isCacheable(
  price: IngredientPrice,
): price is IngredientPrice & { status: 'priced' | 'not_found' } {
  return price.status === 'priced' || price.status === 'not_found';
}

function isFresh(entry: PriceCacheEntry, now: number): boolean {
  return entry.savedAt <= now && now - entry.savedAt < PRICE_CACHE_TTL_MS;
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
  const incoming = prices.filter(isCacheable);
  const entries = Object.entries(map).filter(([, entry]) => isFresh(entry, now));
  if (incoming.length === 0 && entries.length === Object.keys(map).length) return map;
  const next = new Map(entries);
  for (const price of incoming) next.set(price.ingredientId, { price, savedAt: now });
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

export function createPriceCache(key: KvKey<z.infer<typeof cacheSchema>>): PriceCache {
  let memory: PriceCacheMap | null = null;
  let writing: Promise<void> = Promise.resolve();

  function load(): PriceCacheMap {
    if (memory) return memory;
    try {
      memory = key.getSync() ?? {};
    } catch (error) {
      logger.warn('Price cache could not be read', describeError(error));
      memory = {};
    }
    return memory;
  }

  function persist(map: PriceCacheMap) {
    const snapshot = { ...map };
    // Writes are chained so an older snapshot can never land after a newer one.
    writing = writing
      .then(() => key.set(snapshot))
      .catch((error: unknown) => {
        logger.warn('Price cache could not be saved', describeError(error));
      });
  }

  return {
    read(ids, now = Date.now()) {
      return pickFresh(load(), ids, now);
    },
    write(prices, now = Date.now()) {
      const current = load();
      const next = mergeIntoCache(current, prices, now);
      if (next === current) return;
      memory = next;
      persist(next);
    },
    clear() {
      memory = {};
      persist({});
    },
  };
}

/** The app's price cache. */
export const priceCache = createPriceCache(defineKvKey('grocery.prices', cacheSchema));
