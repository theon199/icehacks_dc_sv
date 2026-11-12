/**
 * The two-day nutrition plan: the person's daily targets, the ranked candidates with usable
 * nutrition, and a chunked run of the domain planner over them.
 */
import { useMemo } from 'react';

import { dailyTargets, type DailyTargets } from '@/domain/nutrition';
import type { PlanDaysInput } from '@/domain/plan';
import { usePersonalDetailsStore, usePreferencesStore } from '@/stores';

import { targetGoalsFor, toDomainPersonalDetails, usePersonAge } from '../deps';
import { useChunkedPlan, type ChunkedPlanState } from './useChunkedPlan';
import { usePlanningCandidates, type CandidatesState } from './usePlanningCandidates';
import { toDayPlanCandidates } from '../model/candidates';

export const TWO_DAYS = 2;

export type TwoDayPlanState =
  | Exclude<CandidatesState, { status: 'ready' }>
  /** Nothing safe with nutrition data to plan with. */
  | { status: 'empty' }
  | { status: 'planning'; plan: ChunkedPlanState; targets: DailyTargets };

export function useDailyTargets(): DailyTargets {
  const details = usePersonalDetailsStore((s) => s.details);
  const goals = usePreferencesStore((s) => s.prefs.goals);
  const age = usePersonAge();
  return useMemo(
    () => dailyTargets(toDomainPersonalDetails(details, age), { goals: targetGoalsFor(goals) }),
    [details, goals, age],
  );
}

export function useTwoDayPlan(smallAppetite: boolean): TwoDayPlanState {
  const candidates = usePlanningCandidates();
  const targets = useDailyTargets();
  const ranked = candidates.status === 'ready' ? candidates.ranked : null;
  const input = useMemo<PlanDaysInput | null>(() => {
    if (!ranked) return null;
    const pool = toDayPlanCandidates(ranked);
    if (pool.length === 0) return null;
    return { candidates: pool, targets, days: TWO_DAYS, smallAppetite };
  }, [ranked, targets, smallAppetite]);
  const plan = useChunkedPlan(input);

  if (candidates.status !== 'ready') return candidates;
  if (!input) return { status: 'empty' };
  return { status: 'planning', plan, targets };
}
