import { router } from 'expo-router';

import { addDays, dayIndexOf, weekStartOf, type IsoDate } from '@/domain/plan';
import type { RecipeSummary } from '@/lib/catalog';

import { ActionSheet } from './ActionSheet';
import { SlotPickerSheet } from './SlotPickerSheet';
import type { SavedList } from '../hooks/useSavedList';
import { defaultSlotFor } from '../model/week';

export function openSavedRecipe(recipe: RecipeSummary) {
  router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } });
}

/** A saved recipe's actions and the slot picker for planning it. */
export function SavedSheets({ list, today }: { list: SavedList; today: IsoDate }) {
  const { actionsFor, setActionsFor, planning, setPlanning, startPlanning, remove, confirmPlan } =
    list;
  const { isSafe } = list.saved;
  const thisWeek = weekStartOf(today);
  return (
    <>
      <ActionSheet
        visible={actionsFor !== null}
        title={actionsFor?.title ?? ''}
        onClose={() => setActionsFor(null)}
        actions={
          actionsFor
            ? [
                ...(isSafe(actionsFor)
                  ? [
                      {
                        key: 'plan',
                        label: 'Add to plan',
                        icon: 'calendar.badge.plus' as const,
                        onPress: () => startPlanning(actionsFor),
                      },
                    ]
                  : []),
                {
                  key: 'open',
                  label: 'Open recipe',
                  icon: 'book',
                  onPress: () => openSavedRecipe(actionsFor),
                },
                {
                  key: 'remove',
                  label: 'Remove from saved',
                  icon: 'bookmark.slash',
                  destructive: true,
                  onPress: () => remove(actionsFor),
                },
              ]
            : []
        }
      />
      {planning ? (
        <SlotPickerSheet
          title="Add to plan"
          description={planning.title}
          confirmLabel="Add to plan"
          weeks={[thisWeek, addDays(thisWeek, 7)]}
          today={today}
          initial={{
            week: thisWeek,
            day: dayIndexOf(today),
            slot: defaultSlotFor(planning.course),
          }}
          onConfirm={(target) => confirmPlan(planning, target)}
          onClose={() => setPlanning(null)}
        />
      ) : null}
    </>
  );
}
