import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import type { DayIndex, IsoDate, MealSlot } from '@/domain/plan';
import type { RecipeSummary } from '@/lib/catalog';
import { entryPortion, slotKey, type PlanWeek } from '@/stores';
import { IconButton, space, Text, toast, useTheme } from '@/ui';

import { ActionSheet } from './ActionSheet';
import { AddMealSheet } from './AddMealSheet';
import { SlotPickerSheet } from './SlotPickerSheet';
import { SlotRow } from './SlotRow';
import { plannerActions, type SlotRef } from '../hooks/usePlanner';
import { ARCHIVED_WEEK_MESSAGE } from '../model/planToast';
import { mealsForDay, SLOT_LABELS, type DayInfo } from '../model/week';

export interface DayMealsProps {
  weekStart: IsoDate;
  today: IsoDate;
  info: DayInfo;
  slots: PlanWeek['slots'];
  recipes: ReadonlyMap<string, RecipeSummary>;
  readOnly: boolean;
  /** The small-appetite setting, which sizes meals planned without a portion of their own. */
  smallAppetite: boolean;
  /** Weeks a meal can be moved to. */
  moveWeeks: readonly IsoDate[];
  /** The person's current allergen and diet rules; meals planned before a change may now fail them. */
  isSafe: (recipe: RecipeSummary) => boolean;
}

/**
 * Opens a planned meal's recipe. The meal's portion travels with it (`portion`, the size of each
 * serving relative to a standard one) so the recipe can be sized the way it was planned.
 */
function openRecipe(id: string, portion: number) {
  router.push({ pathname: '/recipe/[id]', params: { id, portion: String(portion) } });
}

/** The meal slots of one day, with add, move and remove flows. */
export function DayMeals({
  weekStart,
  today,
  info,
  slots,
  recipes,
  readOnly,
  smallAppetite,
  moveWeeks,
  isSafe,
}: DayMealsProps) {
  const theme = useTheme();
  const day: DayIndex = info.day;
  const meals = mealsForDay(slots, day);
  const [adding, setAdding] = useState<MealSlot | null>(null);
  const [actionsFor, setActionsFor] = useState<MealSlot | null>(null);
  const [moving, setMoving] = useState<MealSlot | null>(null);
  const ref = useCallback(
    (slot: MealSlot): SlotRef => ({ week: weekStart, day, slot }),
    [weekStart, day],
  );
  const titleOf = (slot: MealSlot) => {
    const entry = slots[slotKey(day, slot)];
    return (entry && recipes.get(entry.recipeId)?.title) ?? SLOT_LABELS[slot];
  };

  const clear = useCallback(
    (slot: MealSlot) => {
      const entry = slots[slotKey(day, slot)];
      plannerActions.clear(ref(slot));
      if (!entry) return;
      toast.show({
        message: `Removed from ${SLOT_LABELS[slot].toLowerCase()}`,
        action: {
          label: 'Undo',
          onPress: () => {
            if (!plannerActions.restoreIfEmpty(ref(slot), entry)) {
              toast.show({ message: `${SLOT_LABELS[slot]} already has a meal again` });
            }
          },
        },
      });
    },
    [slots, day, ref],
  );

  const clearDay = () => {
    Alert.alert(`Clear ${info.long}?`, 'Every meal planned for this day will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear day',
        style: 'destructive',
        onPress: () => plannerActions.clearDay(weekStart, day),
      },
    ]);
  };

  const planned = meals.filter((m) => m.entry).length;
  const hasMeals = planned > 0;
  const plannedText =
    planned === 0
      ? 'Nothing planned yet'
      : planned === 1
        ? '1 meal planned'
        : `${planned} meals planned`;
  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.xl,
          // Today's card carries an ink outline; other days sit on a soft shadow.
          ...(info.isToday
            ? { borderWidth: 2, borderColor: theme.colors.primary }
            : { ...theme.elevation.medium, shadowColor: theme.colors.shadow }),
        },
      ]}
      testID="day-card"
    >
      <View style={styles.heading}>
        <View
          style={styles.titles}
          accessible
          accessibilityRole="header"
          accessibilityLabel={`${info.isToday ? `Today, ${info.long}` : info.long}, ${plannedText}`}
          testID="day-heading"
        >
          <Text variant="title1" numberOfLines={1}>
            {info.weekday}
          </Text>
          <Text variant="subhead" tone="muted" numberOfLines={1}>
            {`${info.monthDay} · ${plannedText}`}
          </Text>
        </View>
        {info.isToday ? (
          <View
            style={[
              styles.today,
              { backgroundColor: theme.colors.primary, borderRadius: theme.radii.pill },
            ]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text variant="label" color="onPrimary">
              Today
            </Text>
          </View>
        ) : null}
        {hasMeals && !readOnly ? (
          <IconButton
            icon="trash"
            accessibilityLabel={`Clear ${info.long}`}
            onPress={clearDay}
            color="textMuted"
            size={36}
            testID="clear-day"
          />
        ) : null}
      </View>
      {meals.map((meal) => {
        const recipe = meal.entry ? recipes.get(meal.entry.recipeId) : undefined;
        return (
          <SlotRow
            key={meal.slot}
            slot={meal.slot}
            entry={meal.entry}
            recipe={recipe}
            unsafe={recipe !== undefined && !isSafe(recipe)}
            readOnly={readOnly}
            portion={meal.entry ? entryPortion(meal.entry, meal.slot, smallAppetite) : 1}
            onAdd={setAdding}
            onOpen={openRecipe}
            onActions={setActionsFor}
            onMove={setMoving}
            onClear={clear}
          />
        );
      })}
      <ActionSheet
        visible={actionsFor !== null}
        title={actionsFor ? titleOf(actionsFor) : ''}
        onClose={() => setActionsFor(null)}
        testID="slot-actions"
        actions={
          actionsFor
            ? [
                {
                  key: 'move',
                  label: 'Move to another day or meal',
                  icon: 'arrow.up.arrow.down',
                  onPress: () => setMoving(actionsFor),
                },
                {
                  key: 'replace',
                  label: 'Replace',
                  icon: 'arrow.triangle.2.circlepath',
                  onPress: () => setAdding(actionsFor),
                },
                {
                  key: 'clear',
                  label: 'Remove from plan',
                  icon: 'minus.circle',
                  destructive: true,
                  onPress: () => clear(actionsFor),
                },
              ]
            : []
        }
      />
      {adding ? (
        <AddMealSheet
          title={`${info.short} ${SLOT_LABELS[adding].toLowerCase()}`}
          onClose={() => setAdding(null)}
          onPick={(recipe) => {
            setAdding(null);
            if (!isSafe(recipe)) {
              // The picker hides recipes that break the person's rules; one can still slip through
              // when they changed while the sheet was open.
              toast.show({
                message: `${recipe.title} doesn't fit your allergies or diet, so it wasn't added`,
                tone: 'danger',
              });
              return;
            }
            if (!plannerActions.place(ref(adding), recipe.id)) {
              toast.show({ message: ARCHIVED_WEEK_MESSAGE, tone: 'danger' });
            }
          }}
        />
      ) : null}
      {moving ? (
        <SlotPickerSheet
          title="Move meal"
          description={titleOf(moving)}
          confirmLabel="Move here"
          weeks={moveWeeks}
          today={today}
          initial={ref(moving)}
          source={ref(moving)}
          onClose={() => setMoving(null)}
          onConfirm={(target) => {
            setMoving(null);
            const moved = plannerActions.move(ref(moving), target);
            toast.show(
              moved
                ? { message: 'Meal moved', tone: 'success' }
                : { message: ARCHIVED_WEEK_MESSAGE, tone: 'danger' },
            );
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.md, padding: space.lg },
  heading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    paddingBottom: space.xs,
  },
  titles: { flex: 1, gap: space.xxs },
  today: { paddingHorizontal: space.md, paddingVertical: space.xs, marginTop: space.xs },
});
