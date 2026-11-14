import { useCallback, useMemo, useState } from 'react';

import { addDays, weekStartOf, type DayIndex, type IsoDate } from '@/domain/plan';
import { useRecipes, type RecipeSummary } from '@/lib/catalog';
import { plannedRecipeIds, usePreferencesStore } from '@/stores';

import {
  useArchivedCount,
  useIsWeekArchived,
  usePastActiveWeeks,
  useWeekSlots,
} from './usePlanner';
import { useIsRecipeSafe } from './useSavedRecipes';
import { initialDay, remainingDays, weekCostRecipes, weekDays } from '../model/week';

/**
 * The planner's position (week and day in view) and everything the Cookbook draws for that week:
 * its days, slots, planned recipes, cost lines and archive state. Week and day change together
 * (a new week opens on today or Monday), so they share one state.
 */
export function usePlannerWeek(today: IsoDate) {
  const currentWeek = weekStartOf(today);
  const [position, setPosition] = useState<{ week: IsoDate; day: DayIndex }>(() => ({
    week: currentWeek,
    day: initialDay(currentWeek, today),
  }));
  const { week: weekStart, day } = position;
  const slots = useWeekSlots(weekStart);
  const archived = useIsWeekArchived(weekStart);
  const pastActive = usePastActiveWeeks(today);
  const archivedCount = useArchivedCount();
  const smallAppetite = usePreferencesStore((s) => s.prefs.smallAppetite);
  const isSafe = useIsRecipeSafe();

  const days = useMemo(() => weekDays(weekStart, today), [weekStart, today]);
  const ids = useMemo(
    () => plannedRecipeIds({ weekStart, slots, archivedAt: null }),
    [weekStart, slots],
  );
  const costRecipes = useMemo(() => weekCostRecipes(slots, smallAppetite), [slots, smallAppetite]);
  const planned = useRecipes(ids);
  const recipes = useMemo(
    () => new Map<string, RecipeSummary>((planned.data ?? []).map((r) => [r.id, r])),
    [planned.data],
  );
  const moveWeeks = useMemo(() => [weekStart, addDays(weekStart, 7)], [weekStart]);

  const goToWeek = useCallback(
    (week: IsoDate) => setPosition({ week, day: initialDay(week, today) }),
    [today],
  );
  const goToToday = useCallback(() => goToWeek(currentWeek), [goToWeek, currentWeek]);
  const setDay = useCallback((next: DayIndex) => setPosition((p) => ({ ...p, day: next })), []);

  return {
    weekStart,
    day,
    days,
    slots,
    archived,
    pastActive,
    archivedCount,
    smallAppetite,
    isSafe,
    ids,
    costRecipes,
    recipes,
    moveWeeks,
    canAutoFill: !archived && remainingDays(weekStart, today).length > 0,
    goToWeek,
    goToToday,
    setDay,
  };
}

export type PlannerWeek = ReturnType<typeof usePlannerWeek>;
