/**
 * Loads price answers for a set of ingredients: fresh answers from the on-device cache first,
 * the rest from the `prices` edge function in batches, with settled answers written back to the
 * cache. A failed request never hides prices that are already known.
 */
import type { CallOptions } from '@/lib/api/client';
import {
  fetchIngredientPrices,
  type IngredientPrice,
  type PriceRequest,
  type PricesNotice,
  type PricesResponse,
} from '@/lib/api/commerce';

import { priceCache, type PriceCache } from './priceCache';

/** Largest batch the `prices` function accepts. */
export const PRICE_BATCH_SIZE = 40;

export interface PriceItem {
  readonly id: string;
  readonly name: string;
}

export interface PricesSnapshot {
  /** The latest answer per ingredient id. Ids with no answer at all are left out. */
  readonly prices: Readonly<Record<string, IngredientPrice>>;
  /** Ids still being looked up; ask again after `retryAfterSeconds`. */
  readonly pendingIds: readonly string[];
  readonly retryAfterSeconds: number | null;
  /** Why lookups cannot run right now, when the server said so. */
  readonly notice: PricesNotice | null;
  /** Some of the request failed; unanswered ids were not looked up this time. */
  readonly failed: boolean;
}

export interface LoadPricesDeps {
  fetchPrices?: (request: PriceRequest, options?: CallOptions) => Promise<PricesResponse>;
  cache?: PriceCache;
  now?: number;
  signal?: AbortSignal;
}

const NOTICE_PRIORITY: readonly PricesNotice[] = [
  'not_configured',
  'not_eligible',
  'budget',
  'daily_limit',
];

function strongestNotice(notices: readonly (PricesNotice | null)[]): PricesNotice | null {
  for (const notice of NOTICE_PRIORITY) if (notices.includes(notice)) return notice;
  return null;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Answers from the cache alone, for showing something before (or without) a request. */
export function cachedSnapshot(
  ids: readonly string[],
  cache: PriceCache = priceCache,
  now = Date.now(),
): PricesSnapshot {
  return {
    prices: cache.read(ids, now),
    pendingIds: [],
    retryAfterSeconds: null,
    notice: null,
    failed: false,
  };
}

/**
 * Throws only when nothing at all could be answered (every request failed and nothing was
 * cached), so the caller's retry policy applies; otherwise reports partial failure in `failed`.
 */
export async function loadPrices(
  items: readonly PriceItem[],
  deps: LoadPricesDeps = {},
): Promise<PricesSnapshot> {
  const { fetchPrices = fetchIngredientPrices, cache = priceCache, signal } = deps;
  const now = deps.now ?? Date.now();
  const ids = items.map((item) => item.id);
  const prices: Record<string, IngredientPrice> = cache.read(ids, now);
  const misses = items.filter((item) => !prices[item.id]);
  if (misses.length === 0) return cachedSnapshot(ids, cache, now);

  const results = await Promise.allSettled(
    chunk(misses, PRICE_BATCH_SIZE).map((batch) =>
      fetchPrices(
        { items: batch.map((item) => ({ id: item.id, name: item.name })) },
        signal ? { signal } : undefined,
      ),
    ),
  );

  const answered: IngredientPrice[] = [];
  const notices: (PricesNotice | null)[] = [];
  let retryAfter: number | null = null;
  let firstError: unknown = null;
  for (const result of results) {
    if (result.status === 'rejected') {
      firstError ??= result.reason;
      continue;
    }
    answered.push(...result.value.prices);
    notices.push(result.value.notice);
    const wait = result.value.retryAfterSeconds;
    if (wait != null) retryAfter = retryAfter === null ? wait : Math.max(retryAfter, wait);
  }

  const wanted = new Set(ids);
  for (const price of answered)
    if (wanted.has(price.ingredientId)) prices[price.ingredientId] = price;
  if (firstError !== null && Object.keys(prices).length === 0) throw firstError;
  cache.write(answered, now);

  const pendingIds = ids.filter((id) => prices[id]?.status === 'pending');
  return {
    prices,
    pendingIds,
    retryAfterSeconds: pendingIds.length > 0 ? (retryAfter ?? 8) : null,
    notice: strongestNotice(notices),
    failed: firstError !== null,
  };
}
