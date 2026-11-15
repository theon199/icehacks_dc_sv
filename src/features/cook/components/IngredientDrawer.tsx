import { FlashList } from '@shopify/flash-list';
import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { RecipeIngredientLine } from '@/lib/catalog';
import { haptics } from '@/lib/haptics';
import { selectSmallAppetite, selectUnits, usePreferencesStore, useSettingsStore } from '@/stores';
import { GlassSheet, Icon, PressableScale, Text, space, useTheme } from '@/ui';

import { cookIngredients, type CookIngredient } from '../logic/ingredients';

export interface IngredientDrawerProps {
  visible: boolean;
  ingredients: readonly RecipeIngredientLine[];
  /** Servings the catalog quantities make. */
  baseServings: number;
  /** Servings being cooked: what the recipe page showed, else the recipe's own. */
  servings: number;
  /** Each serving is a half portion; undefined follows the small-appetite setting. */
  halfPortions?: boolean | undefined;
  checked: ReadonlySet<number>;
  onToggle: (position: number) => void;
  onClose: () => void;
}

interface RowProps {
  line: CookIngredient;
  checked: boolean;
  onToggle: (position: number) => void;
}

const IngredientRow = memo(function IngredientRow({ line, checked, onToggle }: RowProps) {
  const theme = useTheme();
  return (
    <PressableScale
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={line.label}
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
          {line.amount ? <Text variant="bodyStrong">{`${line.amount} `}</Text> : null}
          {line.name}
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
 * per session and only help the cook keep track of what is already in the pan. Amounts are scaled
 * and written in the person's units exactly as the recipe page lists them.
 */
export function IngredientDrawer({
  visible,
  ingredients,
  baseServings,
  servings,
  halfPortions,
  checked,
  onToggle,
  onClose,
}: IngredientDrawerProps) {
  const system = useSettingsStore(selectUnits);
  const smallAppetiteSetting = usePreferencesStore(selectSmallAppetite);
  const smallAppetite = halfPortions ?? smallAppetiteSetting;
  const lines = useMemo(
    () => cookIngredients({ lines: ingredients, baseServings, servings, smallAppetite, system }),
    [ingredients, baseServings, servings, smallAppetite, system],
  );
  const renderItem = useCallback(
    ({ item }: { item: CookIngredient }) => (
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
          data={lines}
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
