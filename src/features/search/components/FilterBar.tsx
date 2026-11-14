import { ScrollView, StyleSheet } from 'react-native';

import { Icon, PressableScale, Text, useTheme } from '@/ui';
import { gutter, minTouchTarget } from '@/ui/tokens';

import type { ActiveFilterChip } from '../filters';

export interface FilterBarProps {
  chips: readonly ActiveFilterChip[];
  onOpenFilters: () => void;
  onRemove: (chip: ActiveFilterChip) => void;
  onClearAll: () => void;
}

/** The Filters button and one removable chip per active filter, scrolling sideways. */
export function FilterBar({ chips, onOpenFilters, onRemove, onClearAll }: FilterBarProps) {
  const theme = useTheme();
  const count = chips.length;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.row}
    >
      <PressableScale
        testID="open-filters"
        accessibilityRole="button"
        accessibilityLabel={count > 0 ? `Filters, ${count} on` : 'Filters'}
        onPress={onOpenFilters}
        hitSlop={pillSlop}
        style={[
          styles.pill,
          {
            borderRadius: theme.radii.pill,
            backgroundColor: count > 0 ? theme.colors.primary : theme.colors.surface,
          },
        ]}
      >
        <Icon
          name="line.3.horizontal.decrease"
          android="tune"
          size={16}
          color={count > 0 ? 'onPrimary' : 'text'}
        />
        <Text variant="label" color={count > 0 ? 'onPrimary' : 'text'} accessible={false}>
          {count > 0 ? `Filters · ${count}` : 'Filters'}
        </Text>
      </PressableScale>
      {chips.map((chip) => (
        <PressableScale
          key={chip.key}
          accessibilityRole="button"
          accessibilityLabel={`Remove filter: ${chip.label}`}
          onPress={() => onRemove(chip)}
          hitSlop={pillSlop}
          style={[
            styles.pill,
            {
              borderRadius: theme.radii.pill,
              backgroundColor: theme.colors.primary,
            },
          ]}
        >
          <Text variant="label" color="onPrimary" numberOfLines={1} accessible={false}>
            {chip.label}
          </Text>
          <Icon name="xmark" android="close" size={12} color="onPrimary" weight="bold" />
        </PressableScale>
      ))}
      {count > 1 ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Clear all filters"
          onPress={onClearAll}
          style={styles.clear}
        >
          <Text variant="label" tone="muted" accessible={false}>
            Clear all
          </Text>
        </PressableScale>
      ) : null}
    </ScrollView>
  );
}

/** Pills are 36 pt tall; the slop brings their touch area to the 44 pt minimum. */
const pillSlop = { top: 4, bottom: 4, left: 0, right: 0 };

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: gutter, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 14,
  },
  clear: { minHeight: minTouchTarget, justifyContent: 'center', paddingHorizontal: 8 },
});
