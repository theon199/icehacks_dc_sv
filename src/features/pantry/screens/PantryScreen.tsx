import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { Stack, router, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { snapCameraHref } from '@/features/snap';
import {
  selectPantryIngredientIds,
  selectPantryShelves,
  usePantryStore,
  type NewPantryItem,
} from '@/stores/pantry';
import { selectUnits, useSettingsStore } from '@/stores/settings';
import { Button, HEADER_TOP_OFFSET, Text, gutter, radii, space, toast, useTheme } from '@/ui';

import { PANTRY_ACTION_HEIGHT } from '../components/metrics';
import { PantryAddSheet } from '../components/PantryAddSheet';
import { PantryHeader } from '../components/PantryHeader';
import { PantryItemEditor } from '../components/PantryItemEditor';
import { PantryMealsSection } from '../components/PantryMealsSection';
import { ShelfHeading, ShelfTiles } from '../components/ShelfCard';
import { restorePantryItem, useSnapAccess } from '../deps';
import type { PantryPatch } from '../editForm';
import { shelfRows, type ShelfRow } from '../shelfRows';

/**
 * The Snap camera (the Snap tab), opened on its pantry mode. Its pantry results screen reads the
 * photo the camera just took, so it is only ever reached from there, never opened directly.
 */
const SNAP_CAMERA_HREF: Href = snapCameraHref({ mode: 'pantry' });

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/cookbook');
}

const openShopping = () => router.push('/shopping');

/** Pantry: what is at home, one card per shelf, with ways to add more and what it can become. */
export function PantryScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const shelves = usePantryStore(selectPantryShelves);
  const onHand = usePantryStore(selectPantryIngredientIds);
  const add = usePantryStore((state) => state.add);
  const update = usePantryStore((state) => state.update);
  const remove = usePantryStore((state) => state.remove);
  const system = useSettingsStore(selectUnits);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const editing = usePantryStore((state) => (editingId ? (state.items[editingId] ?? null) : null));
  // One "now" per visit keeps use-by hints stable while scrolling.
  const [now] = useState(() => new Date());
  const snap = useSnapAccess();

  const rows = useMemo(() => shelfRows(shelves), [shelves]);
  const count = useMemo(
    () => shelves.reduce((total, shelf) => total + shelf.items.length, 0),
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
  const onSnap = useCallback(
    () => router.push(snap === 'open' ? SNAP_CAMERA_HREF : '/ai-consent'),
    [snap],
  );
  const openAdd = useCallback(() => setAdding(true), []);
  const closeAdd = useCallback(() => setAdding(false), []);

  const renderItem = useCallback(
    ({ item: row }: ListRenderItemInfo<ShelfRow>) =>
      row.type === 'shelf' ? (
        <ShelfHeading category={row.category} title={row.title} count={row.count} />
      ) : (
        <ShelfTiles
          items={row.items}
          closes={row.closes}
          system={system}
          now={now}
          onEdit={setEditingId}
        />
      ),
    [system, now],
  );

  return (
    <View
      style={[styles.flex, { paddingTop: insets.top, backgroundColor: theme.colors.background }]}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <FlashList
        data={rows}
        renderItem={renderItem}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.type}
        ListHeaderComponent={
          <PantryHeader onBack={goBack} snap={snap} onSnap={onSnap} count={count} />
        }
        ListEmptyComponent={
          <View
            testID="pantry-empty"
            style={[styles.empty, { backgroundColor: theme.colors.surface }]}
          >
            <Text variant="headline" accessibilityRole="header">
              Your pantry is empty
            </Text>
            <Text variant="body" tone="muted">
              Add what you have at home and we’ll suggest meals and trim your shopping list.
            </Text>
          </View>
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <PantryMealsSection />
            <Button
              testID="pantry-add"
              label="Add an ingredient"
              variant="secondary"
              onPress={openAdd}
              fullWidth
              style={styles.action}
            />
            <Button
              testID="pantry-open-shopping"
              label="Open shopping list"
              variant="ghost"
              onPress={openShopping}
              fullWidth
              style={styles.action}
            />
          </View>
        }
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingTop: HEADER_TOP_OFFSET,
          paddingBottom: insets.bottom + space.xl,
        }}
      />
      <PantryAddSheet visible={adding} onHand={onHand} onAdd={onAdd} onClose={closeAdd} />
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
  empty: { gap: space.sm, padding: space.xl, marginTop: space.md, borderRadius: radii.card },
  footer: { gap: space.md, marginTop: space.md },
  action: { height: PANTRY_ACTION_HEIGHT },
});
