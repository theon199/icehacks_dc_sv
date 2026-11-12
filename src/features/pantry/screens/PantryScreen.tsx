import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  selectPantryIngredientIds,
  selectPantryShelves,
  usePantryStore,
  type NewPantryItem,
  type PantryItem,
} from '@/stores/pantry';
import { selectUnits, useSettingsStore } from '@/stores/settings';
import { Button, EmptyState, Text, gutter, space, toast, useTheme } from '@/ui';

import { PantryAddBar } from '../components/PantryAddBar';
import { PantryItemEditor } from '../components/PantryItemEditor';
import { PantryItemRow } from '../components/PantryItemRow';
import { PantryMealsSection } from '../components/PantryMealsSection';
import { QuickStaples } from '../components/QuickStaples';
import { restorePantryItem, useSnapAccess } from '../deps';
import type { PantryPatch } from '../editForm';
import { SHELF_TITLES } from '../shelves';

/**
 * The Snap camera (the Snap tab). Its pantry results screen reads the photo the camera just took,
 * so it is only ever reached from there, never opened directly.
 */
const SNAP_CAMERA_HREF = '/snap';

type Row =
  | { type: 'shelf'; key: string; title: string; count: number }
  | { type: 'item'; key: string; item: PantryItem };

function ShelfHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.shelf} accessibilityRole="header">
      <Text variant="headline">{title}</Text>
      <Text variant="footnote" tone="subtle">
        {count}
      </Text>
    </View>
  );
}

/** Pantry: what is at home, shelf by shelf, with ways to add more and what it can become. */
export function PantryScreen() {
  const theme = useTheme();
  const shelves = usePantryStore(selectPantryShelves);
  const onHand = usePantryStore(selectPantryIngredientIds);
  const add = usePantryStore((state) => state.add);
  const update = usePantryStore((state) => state.update);
  const remove = usePantryStore((state) => state.remove);
  const system = useSettingsStore(selectUnits);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = usePantryStore((state) => (editingId ? (state.items[editingId] ?? null) : null));
  // One "now" per visit keeps use-by hints stable while scrolling.
  const [now] = useState(() => new Date());
  const snap = useSnapAccess();

  const rows = useMemo<Row[]>(
    () =>
      shelves.flatMap(({ category, items }) => [
        {
          type: 'shelf' as const,
          key: `shelf:${category}`,
          title: SHELF_TITLES[category],
          count: items.length,
        },
        ...items.map((item) => ({ type: 'item' as const, key: item.id, item })),
      ]),
    [shelves],
  );

  const onAdd = useCallback(
    (input: NewPantryItem) => {
      add(input);
      toast.show({ message: `${input.name} added to your pantry`, tone: 'success' });
    },
    [add],
  );
  const onSave = useCallback((id: string, patch: PantryPatch) => update(id, patch), [update]);
  const onRemove = useCallback(
    (id: string) => {
      const item = usePantryStore.getState().items[id];
      remove(id);
      if (item) {
        toast.show({
          message: `${item.name} removed`,
          action: {
            label: 'Undo',
            onPress: () => restorePantryItem(item),
          },
        });
      }
    },
    [remove],
  );

  const renderItem = useCallback(
    ({ item: row }: ListRenderItemInfo<Row>) =>
      row.type === 'shelf' ? (
        <ShelfHeader title={row.title} count={row.count} />
      ) : (
        <PantryItemRow item={row.item} system={system} now={now} onEdit={setEditingId} />
      ),
    [system, now],
  );

  const header = (
    <View style={styles.header}>
      <PantryAddBar onAdd={onAdd} />
      <QuickStaples onHand={onHand} onAdd={onAdd} />
      {snap === 'unavailable' ? null : (
        <Button
          testID="pantry-snap"
          label="Scan your shelves with Snap"
          icon="camera"
          variant="secondary"
          onPress={() => router.push(snap === 'open' ? SNAP_CAMERA_HREF : '/ai-consent')}
          accessibilityHint={
            snap === 'open'
              ? 'Opens the Snap camera to photograph your shelves'
              : 'Snap uses AI. Opens the AI agreement first'
          }
        />
      )}
      <PantryMealsSection />
      {rows.length > 0 ? <Text variant="title3">On your shelves</Text> : null}
    </View>
  );

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <FlashList
        data={rows}
        renderItem={renderItem}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.type}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState
            icon="cabinet"
            title="Your pantry is empty"
            message="Add what you have at home and we’ll suggest meals and trim your shopping list."
          />
        }
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content}
      />
      <PantryItemEditor
        item={editing}
        now={now}
        onSave={onSave}
        onRemove={onRemove}
        onClose={() => setEditingId(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: gutter, paddingBottom: space.xxxl },
  header: { gap: space.xl, paddingTop: space.lg, paddingBottom: space.sm },
  shelf: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: space.lg,
    paddingBottom: space.xs,
  },
});
