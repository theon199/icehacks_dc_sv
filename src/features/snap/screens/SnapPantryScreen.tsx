import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/haptics';
import { MAX_PANTRY_ITEMS, usePantryStore } from '@/stores';
import { Button, EmptyState, Screen, space, Text, toast } from '@/ui';

import { AddItemField } from '../components/AddItemField';
import { DraftItemRow } from '../components/DraftItemRow';
import { NoSnapResult } from '../components/NoSnapResult';
import { PantryMeals } from '../components/PantryMeals';
import { ResultHeader } from '../components/ResultHeader';
import { useIngredientMatches } from '../hooks/useIngredientMatches';
import {
  draftFromDetections,
  draftReducer,
  isInPantry,
  selectedItems,
  toNewPantryItems,
  type DraftItem,
} from '../logic/pantryDraft';
import { nameKey } from '../logic/words';
import { selectPantryResult, useSnapSession, type PantrySnapResult } from '../snapSession';

/** Review what a pantry photo found, add it to the pantry, then see meals it makes possible. */
export function SnapPantryScreen() {
  const result = useSnapSession(selectPantryResult);
  if (!result) return <NoSnapResult mode="pantry" />;
  // A new snap starts a fresh review.
  return <PantryReview key={result.id} result={result} />;
}

interface Added {
  count: number;
  snappedIds: string[];
}

function PantryReview({ result }: { result: PantrySnapResult }) {
  const [items, dispatch] = useReducer(draftReducer, result.items, draftFromDetections);
  const [added, setAdded] = useState<Added | null>(null);
  const addMany = usePantryStore((state) => state.addMany);
  const nextKey = useRef(0);

  const names = useMemo(() => items.map((item) => item.name), [items]);
  const { matches, isMatching } = useIngredientMatches(names);
  const selected = selectedItems(items).length;
  const allSelected = items.length > 0 && selected === items.length;

  const renderItem = useCallback(
    ({ item }: { item: DraftItem }) => {
      const key = nameKey(item.name);
      const match = !key ? null : matches.has(key) ? (matches.get(key)?.name ?? null) : undefined;
      return <DraftItemRow item={item} matchName={match} dispatch={dispatch} />;
    },
    [matches],
  );

  const addItem = useCallback((name: string) => {
    nextKey.current += 1;
    dispatch({ type: 'add', key: `mine-${nextKey.current}`, name });
  }, []);

  const addToPantry = () => {
    const kept = selectedItems(items);
    const entries = toNewPantryItems(items, matches);
    if (entries.length === 0) return;
    addMany(entries);
    // The pantry turns items away once it is full; only report what it really stored.
    const stored = usePantryStore.getState().items;
    const refusedKeys = new Set<string>();
    entries.forEach((entry, index) => {
      const key = kept[index]?.key;
      if (key && !isInPantry(stored, entry)) refusedKeys.add(key);
    });
    if (refusedKeys.size > 0) {
      const landed = entries.length - refusedKeys.size;
      haptics.warning();
      // Keep the review open with only what did not fit, so nothing is silently lost.
      for (const item of kept) {
        if (!refusedKeys.has(item.key)) dispatch({ type: 'remove', key: item.key });
      }
      toast.show({
        message:
          landed === 0
            ? `Your pantry is full (${MAX_PANTRY_ITEMS} items). Remove a few items to make room.`
            : `Added ${landed}. ${refusedKeys.size} didn't fit: your pantry holds ${MAX_PANTRY_ITEMS} items.`,
        tone: 'danger',
      });
      return;
    }
    haptics.success();
    toast.show({
      message: entries.length === 1 ? 'Added to your pantry' : `${entries.length} items added`,
      tone: 'success',
    });
    setAdded({
      count: entries.length,
      snappedIds: entries.flatMap((entry) => (entry.ingredientId ? [entry.ingredientId] : [])),
    });
  };

  if (added) return <PantryMeals addedCount={added.count} snappedIds={added.snappedIds} />;

  const found = result.items.length;
  const header = (
    <View style={styles.header}>
      <ResultHeader
        photoUri={result.photoUri}
        title={found === 1 ? 'Found 1 item' : `Found ${found} items`}
        subtitle="Check the list, fix anything we got wrong, then add it to your pantry."
        remaining={result.remaining}
      />
      {items.length > 0 ? (
        <View style={styles.listTools}>
          <Text variant="subhead" tone="muted">
            {`${selected} of ${items.length} selected`}
          </Text>
          <Button
            label={allSelected ? 'Select none' : 'Select all'}
            variant="ghost"
            size="sm"
            onPress={() => dispatch({ type: 'selectAll', selected: !allSelected })}
            testID="draft-select-all"
          />
        </View>
      ) : null}
    </View>
  );

  const empty = (
    <EmptyState
      icon="refrigerator"
      title="Nothing to add yet"
      message="We could not pick out any items. Add them yourself below, or take another photo."
    />
  );

  return (
    <Screen
      scroll={false}
      testID="snap-pantry"
      footer={
        <Button
          label={
            selected === 0
              ? 'Select items to add'
              : selected === 1
                ? 'Add 1 item to pantry'
                : `Add ${selected} items to pantry`
          }
          onPress={addToPantry}
          disabled={selected === 0}
          loading={isMatching && selected > 0}
          fullWidth
          size="lg"
          testID="snap-pantry-add"
        />
      }
    >
      <FlashList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.key}
        extraData={matches}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={<AddItemField onAdd={addItem} />}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.md, paddingBottom: space.sm },
  listTools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  content: { paddingTop: space.lg, paddingBottom: space.xxl },
});
