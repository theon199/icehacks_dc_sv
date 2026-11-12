import { FlashList } from '@shopify/flash-list';
import { memo, useCallback } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RecipeIngredientLine } from '@/lib/catalog';
import { haptics } from '@/lib/haptics';
import { Icon, IconButton, PressableScale, Text, useTheme } from '@/ui';

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
 * Ingredient checklist that slides over cook mode. Timers keep running underneath; ticks are
 * per session and only help the cook keep track of what is already in the pan.
 */
export function IngredientDrawer({
  visible,
  ingredients,
  checked,
  onToggle,
  onClose,
}: IngredientDrawerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const renderItem = useCallback(
    ({ item }: { item: RecipeIngredientLine }) => (
      <IngredientRow line={item} checked={checked.has(item.position)} onToggle={onToggle} />
    ),
    [checked, onToggle],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.scrim }]}
          accessibilityRole="button"
          accessibilityLabel="Close ingredients"
          onPress={onClose}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: theme.radii.xl,
              borderTopRightRadius: theme.radii.xl,
              paddingBottom: insets.bottom,
            },
          ]}
          testID="cook-ingredient-drawer"
        >
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text variant="title2">Ingredients</Text>
              <Text variant="subhead" tone="muted">
                {checked.size} of {ingredients.length} ready
              </Text>
            </View>
            <IconButton
              icon="xmark"
              accessibilityLabel="Close ingredients"
              variant="tinted"
              onPress={onClose}
            />
          </View>
          <View style={styles.listFrame}>
            <FlashList
              data={ingredients}
              renderItem={renderItem}
              keyExtractor={(line) => String(line.position)}
              extraData={checked}
              contentContainerStyle={styles.list}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  sheet: { height: '72%' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  headerText: { flex: 1, gap: 2 },
  listFrame: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, gap: 2 },
  checkedText: { textDecorationLine: 'line-through' },
});
