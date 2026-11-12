/**
 * Walmart data for the cost summary: whether the integration is configured, which ingredients
 * have a cart-ready item, and the action that builds the cart and opens it.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useMemo } from 'react';

import { useSessionStore } from '@/features/auth';
import {
  createWalmartCart,
  fetchWalmartPrices,
  fetchWalmartStatus,
  type WalmartPrice,
} from '@/lib/api/commerce';

import { groceryKeys } from './queryKeys';
import { normalizeIngredientIds } from './usePrices';
import { cartOutcome, cartReadyIds, MAX_CART_LINES, planCart, type CartOutcome } from './walmart';

/** Status rarely changes; it is a deploy-time setting. */
const STATUS_STALE_MS = 6 * 3_600_000;
/** Item lookups count against an hourly allowance, so availability is reused for a while. */
const ITEMS_STALE_MS = 60 * 60_000;

export function useWalmartStatus(enabled = true) {
  const signedIn = useSessionStore((s) => s.status === 'ready');
  return useQuery({
    queryKey: groceryKeys.walmartStatus,
    queryFn: ({ signal }) => fetchWalmartStatus({ signal }),
    enabled: enabled && signedIn,
    staleTime: STATUS_STALE_MS,
    gcTime: STATUS_STALE_MS,
    refetchOnWindowFocus: false,
  });
}

async function fetchReadyIds(ids: readonly string[], signal: AbortSignal): Promise<Set<string>> {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += MAX_CART_LINES) {
    batches.push(ids.slice(i, i + MAX_CART_LINES));
  }
  const answers = await Promise.all(batches.map((batch) => fetchWalmartPrices(batch, { signal })));
  const prices: WalmartPrice[] = [];
  for (const answer of answers) if (answer.configured) prices.push(...answer.prices);
  return cartReadyIds(prices);
}

/**
 * Ingredient ids (from `ingredientIds`) that have an in-stock Walmart item. Only asks once the
 * integration reports itself configured. `undefined` while unknown.
 */
export function useWalmartReadyIds(ingredientIds: readonly string[], configured: boolean) {
  const idsKey = normalizeIngredientIds(ingredientIds).join(',');
  const ids = useMemo(() => (idsKey ? idsKey.split(',') : []), [idsKey]);
  return useQuery({
    queryKey: groceryKeys.walmartItems(ids),
    queryFn: ({ signal }) => fetchReadyIds(ids, signal),
    enabled: configured && ids.length > 0,
    staleTime: ITEMS_STALE_MS,
    gcTime: ITEMS_STALE_MS,
    refetchOnWindowFocus: false,
  });
}

export interface OpenCartInput {
  readonly idsToBuy: readonly string[];
  readonly readyIds: ReadonlySet<string>;
}

export interface WalmartCartDeps {
  createCart?: typeof createWalmartCart;
  openUrl?: (url: string) => Promise<unknown>;
}

/** Builds the cart for the ready items and opens it in the in-app browser. */
export async function openWalmartCart(
  input: OpenCartInput,
  deps: WalmartCartDeps = {},
): Promise<CartOutcome> {
  const { createCart = createWalmartCart, openUrl = WebBrowser.openBrowserAsync } = deps;
  const plan = planCart(input.idsToBuy, input.readyIds);
  if (!plan) return { kind: 'empty' };
  const outcome = cartOutcome(await createCart(plan.request), plan.overflowIds);
  if (outcome.kind === 'opened') await openUrl(outcome.url);
  return outcome;
}

export function useWalmartCart(deps?: WalmartCartDeps) {
  return useMutation({
    mutationFn: (input: OpenCartInput) => openWalmartCart(input, deps),
  });
}
