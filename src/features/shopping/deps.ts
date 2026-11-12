/**
 * Everything the shopping feature takes from other features, in one place.
 *
 * - `CostSummary`: the list's cost estimate and store-cart actions belong to the grocery feature.
 *   Until `@/features/grocery` exports its `CostSummary`, this renders nothing; when it lands, the
 *   placeholder below becomes a re-export and nothing else in this feature changes.
 * - `useCurrentUserId`: the signed-in account, from the auth feature's public surface.
 */
import type { ShoppingItem } from '@/domain/shopping';
import { useSessionStore } from '@/features/auth';

export interface CostSummaryProps {
  /** Items still to buy. */
  readonly list: readonly ShoppingItem[];
}

/** Cost estimate for the list. Renders nothing until the grocery feature provides one. */
export function CostSummary(_props: CostSummaryProps): null {
  return null;
}

export function useCurrentUserId(): string | null {
  return useSessionStore((state) => state.userId);
}
