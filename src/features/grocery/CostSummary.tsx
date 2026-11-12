import { useCallback, useMemo, useState } from 'react';

import { CostSummaryCard } from './CostSummaryCard';
import { retailerSummary } from './pricing';
import { SourcesSheet } from './SourcesSheet';
import { useCostEstimate, type CostSource } from './useCostEstimate';
import type { WalmartCartDeps } from './useWalmart';
import { WalmartButton } from './WalmartButton';

export type CostSummaryProps = CostSource & {
  /** Hide the "Buy at Walmart" action (e.g. where the screen offers its own). */
  hideWalmart?: boolean;
  /** Test seams for opening links. */
  openUrl?: (url: string) => unknown;
  cartDeps?: WalmartCartDeps;
};

/**
 * Estimated grocery cost for a recipe (`recipeId`, optional `servings`) or a shopping list
 * (`list`, optional `servings`): per serving and in total, what is left out and why, a sheet of
 * price sources, and "Buy at Walmart" when that is possible. Pass a memoised `list`; a new
 * object on every render recomputes the estimate.
 *
 * Renders nothing when the recipe cannot be read, so it never breaks the screen it sits on.
 */
export function CostSummary({
  hideWalmart = false,
  openUrl,
  cartDeps,
  ...source
}: CostSummaryProps) {
  const state = useCostEstimate(source as CostSource);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const openSources = useCallback(() => setSourcesOpen(true), []);
  const closeSources = useCallback(() => setSourcesOpen(false), []);

  const sources = state.status === 'ready' ? state.sources : null;
  const display = state.status === 'ready' ? state.display : null;
  const retailers = useMemo(() => (sources ? retailerSummary(sources) : []), [sources]);
  const excluded = useMemo(
    () => (display ? [...display.missing, ...display.checking] : []),
    [display],
  );

  // Loading reads the local catalog and is brief; an unreadable recipe shows nothing at all.
  if (state.status !== 'ready') return null;
  const ready = state;

  const hasStaples = ready.estimate.items.some((item) => item.status === 'staple');
  return (
    <>
      <CostSummaryCard
        display={ready.display}
        hasStaples={hasStaples}
        retailers={retailers}
        notice={ready.prices.notice}
        lookupFailed={ready.prices.failed}
        onShowSources={openSources}
        onRetry={ready.prices.refetch}
        footer={
          hideWalmart ? null : (
            <WalmartButton
              idsToBuy={ready.idsToBuy}
              names={ready.names}
              {...(cartDeps ? { cartDeps } : {})}
            />
          )
        }
      />
      <SourcesSheet
        visible={sourcesOpen}
        onClose={closeSources}
        sources={ready.sources}
        excluded={excluded}
        {...(openUrl ? { openUrl } : {})}
      />
    </>
  );
}
