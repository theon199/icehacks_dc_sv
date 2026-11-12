import { useMemo, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { useRecipes, type Course } from '@/lib/catalog';
import {
  MEALS,
  selectWeekSlots,
  slotKey,
  useMealPlanStore,
  type DayIndex,
  type Meal,
} from '@/stores';
import {
  Button,
  ChoiceChip,
  IconButton,
  SegmentedControl,
  SheetContent,
  Text,
  space,
  useTheme,
} from '@/ui';

import { clampServings } from '../model/ingredients';
import {
  DAY_SHORT,
  dayIndexOf,
  defaultMeal,
  MEAL_LABELS,
  selectableDays,
  weekStartFor,
  type WeekChoice,
} from '../model/planSlot';

export type PlanSheetPurpose = 'plan' | 'shop';

export interface PlannedSlot {
  weekStart: string;
  day: DayIndex;
  meal: Meal;
  servings: number;
}

export interface PlanSlotSheetProps {
  visible: boolean;
  purpose: PlanSheetPurpose;
  recipeId: string;
  recipeTitle: string;
  course: Course;
  servings: number;
  onClose: () => void;
  onPlanned: (slot: PlannedSlot) => void;
}

const WEEK_SEGMENTS = [
  { value: 'this', label: 'This week' },
  { value: 'next', label: 'Next week' },
] as const;

const MEAL_SEGMENTS = MEALS.map((meal) => ({ value: meal, label: MEAL_LABELS[meal] }));

/** Picks a week, day and meal for a recipe and writes it to the meal plan. */
export function PlanSlotSheet(props: PlanSlotSheetProps) {
  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={props.onClose}
    >
      {props.visible ? <PlanSlotBody {...props} /> : null}
    </Modal>
  );
}

function PlanSlotBody({
  purpose,
  recipeId,
  recipeTitle,
  course,
  servings: initialServings,
  onClose,
  onPlanned,
}: PlanSlotSheetProps) {
  const theme = useTheme();
  const now = useMemo(() => new Date(), []);
  const [week, setWeek] = useState<WeekChoice>('this');
  const [day, setDay] = useState<DayIndex>(dayIndexOf(now));
  const [meal, setMeal] = useState<Meal>(defaultMeal(course));
  const [servings, setServings] = useState(clampServings(initialServings));
  const weekStart = weekStartFor(week, now);
  const days = selectableDays(week, now);
  const chosenDay = days.includes(day) ? day : (days[0] ?? 0);
  const slots = useMealPlanStore(selectWeekSlots(weekStart));
  const occupant = slots[slotKey(chosenDay, meal)];
  const replacing = occupant && occupant.recipeId !== recipeId ? occupant.recipeId : null;
  const replaced = useRecipes(replacing ? [replacing] : []);
  const replacedTitle = replacing ? replaced.data?.[0]?.title : undefined;
  const setSlot = useMealPlanStore((state) => state.setSlot);

  const confirm = () => {
    setSlot(weekStart, slotKey(chosenDay, meal), { recipeId, servings });
    onPlanned({ weekStart, day: chosenDay, meal, servings });
  };

  return (
    <SheetContent
      title={purpose === 'shop' ? 'Add to your shopping list' : 'Add to your plan'}
      description={
        purpose === 'shop'
          ? `Your list is built from planned meals. Pick when you'll cook ${recipeTitle} and its ingredients go on the list.`
          : `When would you like to cook ${recipeTitle}?`
      }
      footer={
        <View style={styles.footer}>
          <Button label="Cancel" variant="ghost" onPress={onClose} style={styles.flex} />
          <Button
            label={purpose === 'shop' ? 'Plan and add' : replacing ? 'Replace' : 'Add to plan'}
            onPress={confirm}
            style={styles.flex}
            testID="plan-confirm"
          />
        </View>
      }
    >
      <SegmentedControl
        segments={WEEK_SEGMENTS}
        value={week}
        onChange={setWeek}
        accessibilityLabel="Week"
      />
      <View style={styles.days} accessibilityRole="radiogroup" accessibilityLabel="Day">
        {days.map((d) => (
          <ChoiceChip
            key={d}
            mode="radio"
            label={week === 'this' && d === dayIndexOf(now) ? 'Today' : DAY_SHORT[d]}
            selected={d === chosenDay}
            onToggle={() => setDay(d)}
          />
        ))}
      </View>
      <SegmentedControl
        segments={MEAL_SEGMENTS}
        value={meal}
        onChange={setMeal}
        accessibilityLabel="Meal"
      />
      <View style={styles.servings}>
        <Text variant="subhead" style={styles.flex}>
          Servings
        </Text>
        <IconButton
          icon="minus"
          accessibilityLabel="Fewer servings"
          variant="tinted"
          onPress={() => setServings((s) => clampServings(s - 1))}
          size={36}
        />
        <Text variant="headline" style={styles.count}>
          {servings}
        </Text>
        <IconButton
          icon="plus"
          accessibilityLabel="More servings"
          variant="tinted"
          onPress={() => setServings((s) => clampServings(s + 1))}
          size={36}
        />
      </View>
      {replacing ? (
        <View
          style={[
            styles.notice,
            { backgroundColor: theme.colors.warningSoft, borderRadius: theme.radii.sm },
          ]}
        >
          <Text variant="footnote" color="onWarningSoft">
            {`This replaces ${replacedTitle ?? 'the recipe'} planned for ${DAY_SHORT[chosenDay]} ${MEAL_LABELS[meal].toLowerCase()}.`}
          </Text>
        </View>
      ) : null}
    </SheetContent>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  footer: { flexDirection: 'row', gap: space.sm },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  servings: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  count: { minWidth: 28, textAlign: 'center' },
  notice: { padding: space.sm },
});
