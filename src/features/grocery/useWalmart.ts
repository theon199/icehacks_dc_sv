/**
 * Walmart data for the cost summary: whether the integration is configured, what is already
 * known about which ingredients are cart-ready, and the action that looks up the rest, builds
 * the cart and opens it.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useSyncExternalStore } from 'react';

import { useSessionStore } from '@/features/auth';
import { createWalmartCart, fetchWalmartPrices, fetchWalmartStatus } from '@/lib/api/commerce';

import { groceryKeys } from './queryKeys';
import { normalizeIngredientIds } from './usePrices';
import { cartOutcome, planCart, type CartOutcome, type KnownReadiness } from './walmart';
import {
  walmartReadiness,
  type FetchWalmartPrices,
  type WalmartReadiness,
} from './walmartReadiness';

/** Status rarely changes; it is a deploy-time setting, and asking does not use the allowance. */
const STATUS_STALE_MS = 6 * 3_600_000;

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

/**
 * What is already known about these ingredient ids. Never asks the server: availability is
 * looked up when the shopper taps the button, through `openWalmartCart`.
 */
export function useKnownWalmartReadiness(
  ingredientIds: readonly string[],
  readiness: WalmartReadiness = walmartReadiness,
): KnownReadiness {
  // Re-render when answers arrive; reading them is a few map lookups, so no memo is needed.
  useSyncExternalStore(readiness.subscribe, readiness.version);
  return readiness.known(normalizeIngredientIds(ingredientIds));
}

export interface OpenCartInput {
  readonly idsToBuy: readonly string[];
}

export interface WalmartCartDeps {
  fetchPrices?: FetchWalmartPrices;
  createCart?: typeof createWalmartCart;
  openUrl?: (url: string) => Promise<unknown>;
  readiness?: WalmartReadiness;
}

/**
 * Looks up the items to buy that have no recent answer, builds a cart of the cart-ready ones and
 * opens it in the in-app browser.
 */
export async function openWalmartCart(
  input: OpenCartInput,
  deps: WalmartCartDeps = {},
): Promise<CartOutcome> {
  const {
    fetchPrices = (ids: readonly string[]) => fetchWalmartPrices(ids),
    createCart = createWalmartCart,
    openUrl = WebBrowser.openBrowserAsync,
    readiness = walmartReadiness,
  } = deps;
  const lookup = await readiness.lookup(normalizeIngredientIds(input.idsToBuy), fetchPrices);
  if (!lookup.configured) return { kind: 'unavailable' };
  const plan = planCart(input.idsToBuy, lookup.ready);
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
