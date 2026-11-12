/**
 * `usePrices(ingredientIds)`: grocery prices for catalog ingredients.
 *
 * Answers saved on this device that are still fresh (see `priceCache`) show immediately (and
 * offline); the rest are requested from the `prices` function, which looks unknown prices up in
 * the background. While any answer is `pending` the hook polls, at the pace the server asks for,
 * a bounded number of times.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useSessionStore } from '@/features/auth';
import type { IngredientPrice, PricesNotice } from '@/lib/api/commerce';
import { useIngredients } from '@/lib/catalog';

import { cachedSnapshot, loadPrices, type PricesSnapshot } from './loadPrices';
import { groceryKeys } from './queryKeys';

/** Polls for pending prices before giving up until the next visit. */
export const MAX_PRICE_POLLS = 8;
const MIN_POLL_MS = 3_000;
const MAX_POLL_MS = 60_000;
const INGREDIENT_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/;

/** Sorted, de-duplicated ids the `prices` function accepts. */
export function normalizeIngredientIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => INGREDIENT_ID.test(id)))].sort();
}

/** A snapshot plus which poll of the current lookup round produced it. */
export interface PolledPrices extends PricesSnapshot {
  /** 1 for the first request of a round; a round ends when nothing is pending. */
  readonly poll: number;
  readonly at: number;
}

/** A round of polls that went quiet for this long starts again from 1 on the next visit. */
const ROUND_IDLE_MS = 5 * 60_000;

export function nextPoll(previous: PolledPrices | undefined, now: number): number {
  if (!previous || previous.pendingIds.length === 0 || now - previous.at > ROUND_IDLE_MS) return 1;
  return previous.poll + 1;
}

/** Milliseconds until the next poll, or false when polling should stop. */
export function nextPollDelay(data: PolledPrices | undefined): number | false {
  if (!data || data.pendingIds.length === 0 || data.poll >= MAX_PRICE_POLLS) return false;
  const seconds = data.retryAfterSeconds ?? 8;
  return Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, seconds * 1000));
}

export interface UsePricesOptions {
  /** Pass false to read saved prices only, without asking the server. */
  enabled?: boolean;
}

export interface UsePricesResult {
  /** The latest answer per ingredient id; ids without any answer are absent. */
  readonly prices: Readonly<Record<string, IngredientPrice>>;
  readonly pendingIds: readonly string[];
  readonly notice: PricesNotice | null;
  /** Waiting for the first answer from the server. */
  readonly isLoading: boolean;
  /**
   * No further lookups will run for ids without a price this visit: offline or signed out, the
   * request failed, the server paused lookups, or polling ran out.
   */
  readonly lookupStopped: boolean;
  /** The last request failed; saved prices are all that is shown. */
  readonly failed: boolean;
  readonly refetch: () => void;
}

export function usePrices(
  ingredientIds: readonly string[],
  options: UsePricesOptions = {},
): UsePricesResult {
  const idsKey = normalizeIngredientIds(ingredientIds).join(',');
  const ids = useMemo(() => (idsKey ? idsKey.split(',') : []), [idsKey]);
  const signedIn = useSessionStore((s) => s.status === 'ready');
  const catalog = useIngredients(ids);
  const items = useMemo(
    () => catalog.data?.map((ingredient) => ({ id: ingredient.id, name: ingredient.name })),
    [catalog.data],
  );
  const enabled = (options.enabled ?? true) && signedIn && !!items && items.length > 0;
  const cached = useMemo(() => cachedSnapshot(ids), [ids]);

  const queryClient = useQueryClient();
  const queryKey = groceryKeys.prices(ids);
  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }): Promise<PolledPrices> => {
      const previous = queryClient.getQueryData<PolledPrices>(queryKey);
      const snapshot = await loadPrices(items ?? [], { signal });
      const at = Date.now();
      return { ...snapshot, poll: nextPoll(previous, at), at };
    },
    enabled,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchInterval: (q) => nextPollDelay(q.state.data),
    refetchIntervalInBackground: false,
  });

  const data: PricesSnapshot = query.data ?? cached;
  const polledOut =
    query.data !== undefined && query.data.pendingIds.length > 0 && !nextPollDelay(query.data);
  const catalogDone = catalog.isSuccess || catalog.isError || ids.length === 0;
  const lookupStopped =
    (catalogDone && !enabled) || query.isError || data.failed || data.notice !== null || polledOut;
  const { refetch } = query;

  return {
    prices: data.prices,
    pendingIds: data.pendingIds,
    notice: data.notice,
    isLoading: enabled && query.data === undefined && !query.isError,
    lookupStopped,
    failed: query.isError || data.failed,
    refetch: () => void refetch(),
  };
}
