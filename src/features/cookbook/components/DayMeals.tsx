import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import type { DayIndex, IsoDate, MealSlot } from '@/domain/plan';
import type { RecipeSummary } from '@/lib/catalog';
import { entryPortion, slotKey, type PlanWeek } from '@/stores';
import { fontFamily, space, Text, toast, useTheme } from '@/ui';

import { ActionSheet } from './ActionSheet';
import { AddMealSheet } from './AddMealSheet';
import { SlotPickerSheet } from './SlotPickerSheet';
import { SlotRow } from './SlotRow';
import { plannerActions, type SlotRef } from '../hooks/usePlanner';
import { ARCHIVED_WEEK_MESSAGE } from '../model/planToast';
import { mealsForDay, plannedSummary, SLOT_LABELS, type DayInfo } from '../model/week';

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
  /** Fixed card size inside the day rail; omitted, the card sizes to its content. */
  width?: number;
  height?: number;
}

/**
 * Opens a planned meal's recipe. The meal's portion travels with it (`portion`, the size of each
 * serving relative to a standard one) so the recipe can be sized the way it was planned.
 */
function openRecipe(id: string, portion: number) {
  router.push({ pathname: '/recipe/[id]', params: { id, portion: String(portion) } });
}

/**
 * One day of the planner as a card: its weekday and plan summary, then each meal as its own tile.
 * Add, move, replace and remove flows open from the tiles; clearing the whole day sits in a filled
 * meal's actions. The body scrolls only when the meals are taller than the card, so it never takes
 * a drag that belongs to the rail or the page.
 */
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
  width,
  height,
}: DayMealsProps) {
  const theme = useTheme();
  const day: DayIndex = info.day;
  const meals = mealsForDay(slots, day);
  const [adding, setAdding] = useState<MealSlot | null>(null);
  const [actionsFor, setActionsFor] = useState<MealSlot | null>(null);
  const [moving, setMoving] = useState<MealSlot | null>(null);
  const [bodyHeight, setBodyHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
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
  const plannedText = plannedSummary(planned);
  const fixed = width !== undefined && height !== undefined;
  const scrolls = fixed && bodyHeight > 0 && contentHeight > bodyHeight + 1;
  const tiles = meals.map((meal) => {
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
  });
  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.card,
          borderColor: info.isToday ? theme.colors.primary : theme.colors.border,
          borderWidth: info.isToday ? 2 : 1,
          shadowColor: theme.colors.shadow,
          ...theme.elevation.medium,
        },
        fixed ? { width, height } : null,
        info.isPast && !info.isToday ? styles.past : null,
      ]}
      testID={`day-card-${info.date}`}
    >
      <View style={styles.heading}>
        <View
          style={styles.titles}
          accessible
          accessibilityRole="header"
          accessibilityLabel={`${info.isToday ? `Today, ${info.long}` : info.long}, ${plannedText.toLowerCase()}`}
          testID={`day-heading-${info.date}`}
        >
          <Text variant="title2" numberOfLines={1} maxFontSizeMultiplier={1.4}>
            {info.weekday}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1} maxFontSizeMultiplier={1.4}>
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
            <Text variant="caption" color="onPrimary" style={styles.bold}>
              Today
            </Text>
          </View>
        ) : null}
      </View>
      {fixed ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.body}
          nestedScrollEnabled
          scrollEnabled={scrolls}
          showsVerticalScrollIndicator={false}
          onLayout={(event) => setBodyHeight(event.nativeEvent.layout.height)}
          onContentSizeChange={(_, h) => setContentHeight(h)}
        >
          {tiles}
        </ScrollView>
      ) : (
        <View style={styles.body}>{tiles}</View>
      )}
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
                ...(hasMeals
                  ? [
                      {
                        key: 'clear-day',
                        label: `Clear ${info.weekday}`,
                        icon: 'trash' as const,
                        destructive: true,
                        onPress: clearDay,
                      },
                    ]
                  : []),
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
  root: { padding: space.md, gap: space.md },
  past: { opacity: 0.66 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  titles: { flex: 1, minWidth: 0, gap: space.xxs },
  today: { paddingHorizontal: space.md, paddingVertical: space.xs },
  bold: { fontFamily: fontFamily.textBold },
  flex: { flex: 1 },
  body: { gap: space.sm },
});
