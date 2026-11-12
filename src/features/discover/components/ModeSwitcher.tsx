import { memo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import type { DeckMode } from '@/domain';
import { ChoiceChip } from '@/ui';
import { gutter, space } from '@/ui/tokens';

import type { ModeOption } from '../modes';

export interface ModeSwitcherProps {
  modes: readonly ModeOption[];
  value: DeckMode;
  onChange: (mode: DeckMode) => void;
}

/** For you · Quick · Use my pantry · Gentle, as a scrollable row of single-choice chips. */
export const ModeSwitcher = memo(function ModeSwitcher({
  modes,
  value,
  onChange,
}: ModeSwitcherProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="radiogroup"
      accessibilityLabel="Discover mode"
    >
      {modes.map((mode) => (
        <ChoiceChip
          key={mode.value}
          testID={`discover-mode-${mode.value}`}
          label={mode.label}
          mode="radio"
          selected={mode.value === value}
          onToggle={(next) => {
            if (next) onChange(mode.value);
          }}
        />
      ))}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  row: { gap: space.sm, paddingHorizontal: gutter, paddingVertical: space.xs },
});
