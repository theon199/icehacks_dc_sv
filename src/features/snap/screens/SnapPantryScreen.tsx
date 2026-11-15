import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, EmptyState, space, Text } from '@/ui';

import { AddItemField } from '../components/AddItemField';
import { DraftItemRow } from '../components/DraftItemRow';
import { NoSnapResult } from '../components/NoSnapResult';
import { PantryMeals } from '../components/PantryMeals';
import { ResultHeader } from '../components/ResultHeader';
import { ResultSheet } from '../components/ResultSheet';
import { SnapPill } from '../components/SnapPill';
import { useAddToPantry, type AddedToPantry } from '../hooks/useAddToPantry';
import { useIngredientMatches } from '../hooks/useIngredientMatches';
import { snapCameraHref } from '../links';
import {
  draftFromDetections,
  draftReducer,
  selectedItems,
  type DraftItem,
} from '../logic/pantryDraft';
import { nameKey } from '../logic/words';
import { useSnapSession, type PantrySnapResult } from '../snapSession';
import { SweepReview } from './SweepReview';

/** Back to the camera for another photo. */
function retake() {
  if (router.canGoBack()) router.back();
  else router.replace(snapCameraHref({ mode: 'pantry' }));
}

/**
 * Review what a pantry photo (or a fridge sweep) found, add it to the pantry, then see meals it
 * makes possible.
 */
export function SnapPantryScreen() {
  const result = useSnapSession((state) => state.result);
  // A new snap starts a fresh review.
  if (result?.mode === 'sweep') return <SweepReview key={result.id} result={result} />;
  if (result?.mode !== 'pantry') return <NoSnapResult mode="pantry" />;
  return <PantryReview key={result.id} result={result} />;
}

function PantryReview({ result }: { result: PantrySnapResult }) {
  const [items, dispatch] = useReducer(draftReducer, result.items, draftFromDetections);
  const [added, setAdded] = useState<AddedToPantry | null>(null);
  const add = useAddToPantry(dispatch);
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
    const done = add(items, matches);
    if (done) setAdded(done);
  };

  if (added) {
    return (
      <PantryMeals
        photoUri={result.photoUri}
        onClose={retake}
        addedCount={added.count}
        snappedIds={added.snappedIds}
      />
    );
  }

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

  const addLabel =
    selected === 0
      ? 'Select items to add'
      : selected === 1
        ? 'Add 1 item to pantry'
        : `Add ${selected} items to pantry`;
  return (
    <ResultSheet
      photoUri={result.photoUri}
      onClose={retake}
      peek={0.24}
      testID="snap-pantry"
      footer={
        <SnapPill
          label={addLabel}
          tone="lime"
          onPress={addToPantry}
          // Adding waits for catalog matching, so each item lands under its catalog name.
          disabled={selected === 0 || isMatching}
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
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      />
    </ResultSheet>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.lg, paddingBottom: space.sm },
  listTools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  content: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xl },
});
