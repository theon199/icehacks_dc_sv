import { FlashList } from '@shopify/flash-list';
import { memo, useCallback } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RecipeIngredientLine } from '@/lib/catalog';
import { haptics } from '@/lib/haptics';
import {
  GlassIconButton,
  GlassSurface,
  Icon,
  PressableScale,
  Text,
  radii,
  space,
  useTheme,
} from '@/ui';

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
        <View accessibilityViewIsModal style={styles.sheet} testID="cook-ingredient-drawer">
          <GlassSurface radius="sheet" fallbackColor="surface" style={styles.surface}>
            <View style={[styles.grabber, { backgroundColor: theme.colors.borderStrong }]} />
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text variant="title2">Ingredients</Text>
                <Text variant="subhead" tone="muted">
                  {checked.size} of {ingredients.length} ready
                </Text>
              </View>
              <GlassIconButton
                icon="xmark"
                accessibilityLabel="Close ingredients"
                onPress={onClose}
              />
            </View>
            <View style={styles.listFrame}>
              <FlashList
                data={ingredients}
                renderItem={renderItem}
                keyExtractor={(line) => String(line.position)}
                extraData={checked}
                contentContainerStyle={{
                  ...styles.list,
                  paddingBottom: insets.bottom + theme.radii.sheet + space.lg,
                }}
              />
            </View>
          </GlassSurface>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  // The foot hangs below the screen edge so only the top corners show rounded.
  sheet: { height: '74%', marginBottom: -radii.sheet },
  surface: { flex: 1 },
  grabber: { width: 44, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: space.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  headerText: { flex: 1, gap: space.xxs },
  listFrame: { flex: 1 },
  list: { paddingHorizontal: space.xl },
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
