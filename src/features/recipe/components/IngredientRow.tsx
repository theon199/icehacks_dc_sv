import { useRecyclingState } from '@shopify/flash-list';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, PressableScale, Text, space, useTheme } from '@/ui';

import type { IngredientRow as Row } from '../model/ingredients';
import { ratioLabel, type SubstitutionSuggestion } from '../model/substitutions';

export interface IngredientRowProps {
  row: Row;
  suggestions: readonly SubstitutionSuggestion[] | undefined;
}

/** One ingredient: pantry check, amount, name and, when relevant, swaps that suit the person. */
export const IngredientRow = memo(function IngredientRow({ row, suggestions }: IngredientRowProps) {
  const theme = useTheme();
  // Rows are recycled by the list; the open state belongs to this line only.
  const [open, setOpen] = useRecyclingState(false, [row.key]);
  const swaps = suggestions ?? [];
  const spoken = [
    row.amount,
    row.name,
    row.optional ? 'optional' : null,
    row.owned ? 'in your pantry' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={[styles.container, { borderBottomColor: theme.colors.border }]}>
      <View style={styles.row} accessible accessibilityLabel={spoken}>
        <Icon
          name={row.owned ? 'checkmark.circle.fill' : 'circle'}
          android={row.owned ? 'check_circle' : 'radio_button_unchecked'}
          size={20}
          color={row.owned ? 'success' : 'borderStrong'}
        />
        <Text variant="bodyStrong" style={styles.amount}>
          {row.amount ?? ''}
        </Text>
        <View style={styles.name}>
          <Text variant="body">
            {row.name}
            {row.optional ? (
              <Text variant="footnote" tone="subtle">
                {'  '}optional
              </Text>
            ) : null}
          </Text>
          {row.rounded ? (
            <Text variant="caption" tone="subtle">
              Rounded to a usable amount
            </Text>
          ) : null}
        </View>
      </View>
      {swaps.length > 0 ? (
        <View style={styles.swaps}>
          <PressableScale
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={`${swaps.length === 1 ? 'A swap' : `${swaps.length} swaps`} for ${row.name}`}
            onPress={() => setOpen((value) => !value)}
            hitSlop={6}
            style={[
              styles.swapToggle,
              { backgroundColor: theme.colors.accentSoft, borderRadius: theme.radii.pill },
            ]}
            testID={`${row.key}-swaps`}
          >
            <Icon name="arrow.triangle.swap" android="swap_horiz" size={14} color="onAccentSoft" />
            <Text variant="caption" color="onAccentSoft">
              {swaps[0]!.label}
              {swaps.length > 1 ? ` +${swaps.length - 1}` : ''}
            </Text>
          </PressableScale>
          {open
            ? swaps.map((swap) => (
                <View
                  key={swap.toId}
                  style={[
                    styles.swap,
                    { backgroundColor: theme.colors.surfaceSunken, borderRadius: theme.radii.sm },
                  ]}
                >
                  <Text variant="subhead">
                    Try {swap.toName.toLowerCase()} · {swap.label.toLowerCase()}
                  </Text>
                  <Text variant="footnote" tone="muted">
                    {ratioLabel(swap.ratio)}. {swap.note}
                  </Text>
                </View>
              ))
            : null}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingVertical: space.sm,
    gap: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, minHeight: 28 },
  amount: { minWidth: 76, maxWidth: 110 },
  name: { flex: 1, gap: 2 },
  swaps: { paddingLeft: 28, gap: space.xs },
  swapToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.xs,
    paddingHorizontal: space.sm,
    minHeight: 32,
  },
  swap: { padding: space.sm, gap: 2 },
});
