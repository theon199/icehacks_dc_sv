/**
 * "Plan my week": builds an auto-fill proposal for the remaining days of a week from the ranked
 * candidates, without touching the plan until the person accepts it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { autoFillWeek, type AutoFillResult, type IsoDate } from '@/domain/plan';
import type { RecipeSummary as DomainRecipeSummary } from '@/domain/types';
import { useRecipes } from '@/lib/catalog';
import { plannedRecipeIds, usePantryStore, usePreferencesStore, type Preferences } from '@/stores';

import { goalTagsFor, toPantryIds } from '../deps';
import { whenIdle } from './defer';
import { plannerActions, useWeekSlots } from './usePlanner';
import { usePlanningCandidates, type CandidatesState } from './usePlanningCandidates';
import { byId, toFillCandidates, type Ranked } from '../model/candidates';
import { remainingDays, toSlotWrites, toWeekPlan } from '../model/week';

/** Weekends get twice the weeknight time budget, with at least an hour. */
export function minutesPerDay(budget: number | null): number[] | undefined {
  if (budget == null) return undefined;
  const weekend = Math.max(budget * 2, 60);
  return [budget, budget, budget, budget, budget, weekend, weekend];
}

export interface FillOptions {
  readonly weekStart: IsoDate;
  readonly today: IsoDate;
  readonly smallAppetite: boolean;
}

/** Pure core of the preview, exported for tests. */
export function buildPreview(
  ranked: readonly Ranked[],
  prefs: Preferences,
  pantryIds: readonly string[],
  slots: Parameters<typeof toWeekPlan>[0],
  plannedCuisines: Readonly<Record<string, string>>,
  { weekStart, today, smallAppetite }: FillOptions,
): AutoFillResult {
  return autoFillWeek({
    weekStart,
    candidates: toFillCandidates(ranked),
    plan: toWeekPlan(slots, weekStart),
    days: remainingDays(weekStart, today),
    maxMinutesPerMeal: minutesPerDay(prefs.maxMinutes),
    goals: goalTagsFor(prefs.goals),
    pantryIds,
    servings: prefs.householdSize,
    smallAppetite,
    plannedCuisines,
  });
}

export type PreviewState =
  | Exclude<CandidatesState, { status: 'ready' }>
  | {
      status: 'ready';
      result: AutoFillResult;
      recipes: ReadonlyMap<string, DomainRecipeSummary>;
    };

export function useAutoFillPreview(options: FillOptions): {
  state: PreviewState;
  accept: () => number;
} {
  const { weekStart } = options;
  const candidates = usePlanningCandidates();
  const prefs = usePreferencesStore((s) => s.prefs);
  const pantry = usePantryStore((s) => s.items);
  const slots = useWeekSlots(weekStart);
  const week = useMemo(() => ({ weekStart, slots, archivedAt: null }), [weekStart, slots]);
  const plannedIds = useMemo(() => plannedRecipeIds(week), [week]);
  const planned = useRecipes(plannedIds);
  const [preview, setPreview] = useState<{ key: unknown; result: AutoFillResult } | null>(null);

  const ranked = candidates.status === 'ready' ? candidates.ranked : null;
  const plannedReady = plannedIds.length === 0 || planned.data !== undefined;
  const key = useMemo(
    () => ({ ranked, prefs, pantry, week, options }),
    [ranked, prefs, pantry, week, options],
  );

  useEffect(() => {
    if (!ranked || !plannedReady) return;
    const cuisines: Record<string, string> = {};
    for (const r of planned.data ?? []) cuisines[r.id] = r.cuisine;
    return whenIdle(() => {
      const result = buildPreview(ranked, prefs, toPantryIds(pantry), week, cuisines, options);
      setPreview({ key, result });
    });
  }, [key, ranked, plannedReady, planned.data, prefs, pantry, week, options]);

  const recipes = useMemo(() => byId(ranked ?? []), [ranked]);
  const accept = useCallback(() => {
    if (!preview) return 0;
    return plannerActions.applyWrites(weekStart, toSlotWrites(preview.result.assignments));
  }, [preview, weekStart]);

  if (candidates.status !== 'ready') return { state: candidates, accept };
  if (!preview || preview.key !== key) return { state: { status: 'loading' }, accept };
  return { state: { status: 'ready', result: preview.result, recipes }, accept };
}
