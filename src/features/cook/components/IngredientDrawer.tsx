import { FlashList } from '@shopify/flash-list';
import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import type { RecipeIngredientLine } from '@/lib/catalog';
import { haptics } from '@/lib/haptics';
import { GlassSheet, Icon, PressableScale, Text, space, useTheme } from '@/ui';

export interface IngredientDrawerProps {
  visible: boolean;
  ingredients: readonly RecipeIngredientLine[];
  checked: ReadonlySet<number>;
  onToggle: (position: number) => void;
  onClose: () => void;
}

interface RowProps {
  line: RecipeIngredientLine;
  checked: boolean;
  onToggle: (position: number) => void;
}

const IngredientRow = memo(function IngredientRow({ line, checked, onToggle }: RowProps) {
  const theme = useTheme();
  return (
    <PressableScale
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={line.optional ? `${line.text}, optional` : line.text}
      pressedOpacity={0.6}
      pressedScale={1}
      onPress={() => {
        haptics.selection();
        onToggle(line.position);
      }}
      style={[styles.row, { borderBottomColor: theme.colors.border }]}
    >
      <Icon
        name={checked ? 'checkmark.circle.fill' : 'circle'}
        size={26}
        color={checked ? 'primary' : 'borderStrong'}
      />
      <View style={styles.rowText}>
        <Text
          variant="body"
          tone={checked ? 'subtle' : 'default'}
          style={checked ? styles.checkedText : null}
        >
          {line.text}
        </Text>
        {line.optional ? (
          <Text variant="caption" tone="muted">
            Optional
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
});

/**
 * Ingredient checklist on a glass sheet over cook mode. Timers keep running underneath; ticks are
 * per session and only help the cook keep track of what is already in the pan.
 */
export function IngredientDrawer({
  visible,
  ingredients,
  checked,
  onToggle,
  onClose,
}: IngredientDrawerProps) {
  const renderItem = useCallback(
    ({ item }: { item: RecipeIngredientLine }) => (
      <IngredientRow line={item} checked={checked.has(item.position)} onToggle={onToggle} />
    ),
    [checked, onToggle],
  );

  return (
    <GlassSheet
      visible={visible}
      onClose={onClose}
      title="Ingredients"
      description={`${checked.size} of ${ingredients.length} ready`}
      closeLabel="Close ingredients"
      heightRatio={SHEET_HEIGHT}
      scroll={false}
      testID="cook-ingredient-drawer"
    >
      <View style={styles.listFrame}>
        <FlashList
          data={ingredients}
          renderItem={renderItem}
          keyExtractor={(line) => String(line.position)}
          extraData={checked}
        />
      </View>
    </GlassSheet>
  );
}

/** Tall enough for a long recipe without covering the step's heading behind it. */
const SHEET_HEIGHT = 0.74;

const styles = StyleSheet.create({
  listFrame: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, gap: 2 },
  checkedText: { textDecorationLine: 'line-through' },
});
