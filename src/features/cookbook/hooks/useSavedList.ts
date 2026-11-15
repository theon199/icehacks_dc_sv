import { useCallback, useMemo, useState } from 'react';

import type { IsoDate } from '@/domain/plan';
import type { RecipeSummary } from '@/lib/catalog';
import { usePreferencesStore, useSavedStore } from '@/stores';
import { toast } from '@/ui';

import { plannerActions, type SlotRef } from './usePlanner';
import { useSavedRecipes } from './useSavedRecipes';
import { DEFAULT_SAVED_FILTERS, filterSaved, type SavedFilters } from '../model/savedFilters';
import { SLOT_LABELS, weekDays } from '../model/week';

/**
 * Saved recipes for the Cookbook's list: search and filters, the recipe whose actions are open,
 * the one being planned, and the remove and plan flows. Planning is fail-closed: a recipe that
 * does not pass the current allergen and diet rules never reaches the slot picker or the plan.
 */
export function useSavedList(today: IsoDate) {
  const saved = useSavedRecipes();
  const smallAppetite = usePreferencesStore((s) => s.prefs.smallAppetite);
  const [chosenFilters, setFilters] = useState<SavedFilters>(DEFAULT_SAVED_FILTERS);
  // The Gentle filter only exists in small appetite mode; when it is hidden its filter is off too.
  const filters = useMemo(
    () => (smallAppetite ? chosenFilters : { ...chosenFilters, gentle: false }),
    [chosenFilters, smallAppetite],
  );
  const [actionsFor, setActionsFor] = useState<RecipeSummary | null>(null);
  const [planning, setPlanning] = useState<RecipeSummary | null>(null);
  const visible = useMemo(() => filterSaved(saved.recipes, filters), [saved.recipes, filters]);
  const { isSafe } = saved;

  const startPlanning = useCallback(
    (recipe: RecipeSummary) => {
      if (isSafe(recipe)) setPlanning(recipe);
    },
    [isSafe],
  );

  const remove = useCallback((recipe: RecipeSummary) => {
    const { saved: entries, unsave, save } = useSavedStore.getState();
    const savedAt = entries[recipe.id]?.savedAt;
    unsave(recipe.id);
    toast.show({
      message: `Removed ${recipe.title}`,
      action: { label: 'Undo', onPress: () => save(recipe.id, savedAt) },
    });
  }, []);

  const confirmPlan = useCallback(
    (recipe: RecipeSummary, target: SlotRef) => {
      setPlanning(null);
      if (!isSafe(recipe)) {
        toast.show({
          message: `${recipe.title} does not fit your allergens or diet`,
          tone: 'danger',
        });
        return;
      }
      if (!plannerActions.place(target, recipe.id)) {
        toast.show({ message: 'That week is archived. Restore it to plan meals.', tone: 'danger' });
        return;
      }
      const day = weekDays(target.week, today)[target.day];
      toast.show({
        message: `Planned for ${day?.short ?? ''} ${SLOT_LABELS[target.slot].toLowerCase()}`,
        tone: 'success',
      });
    },
    [isSafe, today],
  );

  return {
    saved,
    smallAppetite,
    filters,
    setFilters,
    visible,
    actionsFor,
    setActionsFor,
    planning,
    setPlanning,
    startPlanning,
    remove,
    confirmPlan,
  };
}

export type SavedList = ReturnType<typeof useSavedList>;
