/**
 * Ranked, safety-screened recipes for "Plan my week" and the two-day plan. The catalog query does
 * the coarse SQL filtering; ranking waits for the JS thread to go idle so opening a planner screen
 * never stutters.
 */
import { useEffect, useMemo, useState } from 'react';

import type { RankInput } from '@/domain/recommend';
import { dietMask, useCandidates, type CandidateFilters } from '@/lib/catalog';
import {
  selectFeedbackEvents,
  selectUnits,
  useFeedbackStore,
  usePantryStore,
  usePreferencesStore,
  useSettingsStore,
  type Preferences,
} from '@/stores';

import { toDomainFeedback, toDomainPreferences, toPantryIds } from '../deps';
import { whenIdle } from './defer';
import { rankForPlanning, type Ranked } from '../model/candidates';

/** Enough variety for a full week and a beam search, small enough to rank in a few ms. */
export const PLANNING_POOL = 600;

export type CandidatesState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown; retry: () => void }
  /** Allergens not answered yet: nothing can be shown as safe. */
  | { status: 'needs_safety' }
  | { status: 'ready'; ranked: readonly Ranked[] };

export function candidateFilters(prefs: Preferences): CandidateFilters {
  return {
    dietMask: dietMask(prefs.diets),
    avoidAllergens: prefs.allergens,
    limit: PLANNING_POOL,
  };
}

export function usePlanningCandidates(): CandidatesState {
  const prefs = usePreferencesStore((s) => s.prefs);
  const units = useSettingsStore(selectUnits);
  const pantry = usePantryStore((s) => s.items);
  const feedback = useFeedbackStore(selectFeedbackEvents);
  const filters = useMemo(() => candidateFilters(prefs), [prefs]);
  const needsSafety = !prefs.allergensAnswered;
  const query = useCandidates(filters, { enabled: !needsSafety });
  const [ranked, setRanked] = useState<{ source: unknown; list: readonly Ranked[] } | null>(null);

  const data = query.data;
  useEffect(() => {
    if (!data) return;
    const input: RankInput = {
      prefs: toDomainPreferences(prefs, units),
      now: Date.now(),
      feedback: toDomainFeedback(feedback),
      pantry: toPantryIds(pantry),
    };
    return whenIdle(() => {
      setRanked({ source: data, list: rankForPlanning(data, input) });
    });
  }, [data, prefs, units, pantry, feedback]);

  if (needsSafety) return { status: 'needs_safety' };
  if (query.isError) {
    return { status: 'error', error: query.error, retry: () => void query.refetch() };
  }
  if (!ranked || ranked.source !== data) return { status: 'loading' };
  return { status: 'ready', ranked: ranked.list };
}
