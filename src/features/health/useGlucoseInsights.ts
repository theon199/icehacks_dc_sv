import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { summarizeGlucose, type GlucoseSummary } from '@/domain/health';

import { getDishTitles } from './deps';
import { useHealthStore } from './healthStore';

export interface GlucoseInsightsView {
  summary: GlucoseSummary;
  /** Catalog titles by recipe ref; missing refs fall back to generic wording. */
  titles: Record<string, string>;
}

const NO_TITLES: Record<string, string> = {};

/** Per-dish glucose observations from the pairs kept on this device. */
export function useGlucoseInsights(): GlucoseInsightsView {
  const pairs = useHealthStore((state) => state.glucosePairs);
  const lastRefreshAt = useHealthStore((state) => state.lastRefreshAt);

  // Pairs only change with a refresh, so the refresh time is the moment they describe.
  const summary = useMemo(
    () => summarizeGlucose(pairs, lastRefreshAt ?? 0),
    [pairs, lastRefreshAt],
  );

  const refs = useMemo(() => summary.dishes.map((dish) => dish.recipeRef).sort(), [summary]);
  const titles = useQuery({
    queryKey: ['health', 'dishTitles', refs],
    queryFn: () => getDishTitles(refs),
    enabled: refs.length > 0,
    staleTime: Infinity,
  });

  return { summary, titles: titles.data ?? NO_TITLES };
}
