import { useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { MEAL_SLOTS, type IsoDate } from '@/domain/plan';
import { useRecipes } from '@/lib/catalog';
import { slotKey } from '@/stores';
import { Button, ChoiceChip, space, Text } from '@/ui';

import { BottomSheet } from './BottomSheet';
import { useWeekSlots, type SlotRef } from '../hooks/usePlanner';
import { SLOT_LABELS, weekDays, weekTitle } from '../model/week';

export interface SlotPickerSheetProps {
  title: string;
  description?: string;
  confirmLabel: string;
  /** Weeks the person can pick from, in display order. */
  weeks: readonly IsoDate[];
  today: IsoDate;
  initial: SlotRef;
  /** The cell being moved, if any: it cannot be its own destination. */
  source?: SlotRef;
  onConfirm: (target: SlotRef) => void;
  onClose: () => void;
}

function sameRef(a: SlotRef | undefined, b: SlotRef): boolean {
  return !!a && a.week === b.week && a.day === b.day && a.slot === b.slot;
}

/**
 * Pick a week, day and meal slot with plain radio chips. This is the accessible way to move or
 * place a meal: every choice is a labelled control and nothing depends on dragging.
 */
export function SlotPickerSheet({
  title,
  description,
  confirmLabel,
  weeks,
  today,
  initial,
  source,
  onConfirm,
  onClose,
}: SlotPickerSheetProps) {
  const [target, setTarget] = useState<SlotRef>(initial);
  const days = useMemo(() => weekDays(target.week, today), [target.week, today]);
  const slots = useWeekSlots(target.week);
  const occupant = slots[slotKey(target.day, target.slot)];
  const occupantIds = useMemo(() => (occupant ? [occupant.recipeId] : []), [occupant]);
  const occupantRecipe = useRecipes(occupantIds).data?.[0];
  const unchanged = sameRef(source, target);

  let note: string | null = null;
  if (unchanged) note = 'Choose a different day or meal.';
  else if (occupant) {
    const name = occupantRecipe?.title ?? 'the meal there';
    note = source ? `Swaps places with ${name}.` : `Replaces ${name}.`;
  }

  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={title}
      {...(description ? { description } : {})}
      testID="slot-picker"
      footer={
        <>
          <Button
            label={confirmLabel}
            onPress={() => onConfirm(target)}
            disabled={unchanged}
            fullWidth
            testID="slot-picker-confirm"
          />
          <Button label="Cancel" variant="ghost" onPress={onClose} haptic={false} fullWidth />
        </>
      }
    >
      {weeks.length > 1 ? (
        <Group label="Week">
          {weeks.map((week) => (
            <ChoiceChip
              key={week}
              mode="radio"
              label={weekTitle(week, today)}
              selected={target.week === week}
              onToggle={() => setTarget((t) => ({ ...t, week }))}
            />
          ))}
        </Group>
      ) : null}
      <Group label="Day">
        {days.map((d) => (
          <ChoiceChip
            key={d.day}
            mode="radio"
            label={`${d.short} ${d.dayOfMonth}`}
            selected={target.day === d.day}
            onToggle={() => setTarget((t) => ({ ...t, day: d.day }))}
            testID={`pick-day-${d.day}`}
          />
        ))}
      </Group>
      <Group label="Meal">
        {MEAL_SLOTS.map((slot) => (
          <ChoiceChip
            key={slot}
            mode="radio"
            label={SLOT_LABELS[slot]}
            selected={target.slot === slot}
            onToggle={() => setTarget((t) => ({ ...t, slot }))}
            testID={`pick-slot-${slot}`}
          />
        ))}
      </Group>
      {note ? (
        <Text variant="footnote" tone="muted" accessibilityLiveRegion="polite">
          {note}
        </Text>
      ) : null}
    </BottomSheet>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text variant="overline" tone="muted">
        {label}
      </Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
