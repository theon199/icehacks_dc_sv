/**
 * Everything the shopping feature takes from other features, in one place.
 *
 * - `CostSummary`: the list's cost estimate and store-cart actions belong to the grocery feature;
 *   this hands it the items still to buy.
 * - `useCurrentUserId` / `whenSignedOut`: the signed-in account, from the auth feature's public
 *   surface.
 */
import { createElement, useMemo } from 'react';

import type { ShoppingItem } from '@/domain/shopping';
import { useSessionStore } from '@/features/auth';
import { CostSummary as GroceryCostSummary } from '@/features/grocery';

export interface CostSummaryProps {
  /** Items still to buy. */
  readonly list: readonly ShoppingItem[];
}

/** Cost estimate for the items still to buy, from the grocery feature. */
export function CostSummary({ list }: CostSummaryProps) {
  // The estimate reruns whenever its source object changes, so it changes only with the items.
  const source = useMemo(() => ({ items: list }), [list]);
  return createElement(GroceryCostSummary, { list: source });
}

export function useCurrentUserId(): string | null {
  return useSessionStore((state) => state.userId);
}

/**
 * Calls `onSignedOut` whenever nobody is signed in: now, if that is already the case, and again on
 * every later sign-out (account deletion ends in a sign-out too). Returns the unsubscribe.
 */
export function whenSignedOut(onSignedOut: () => void): () => void {
  if (useSessionStore.getState().status === 'signedOut') onSignedOut();
  return useSessionStore.subscribe((state, previous) => {
    if (state.status === 'signedOut' && previous.status !== 'signedOut') onSignedOut();
  });
}
