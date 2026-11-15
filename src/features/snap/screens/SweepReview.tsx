import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useMemo, useReducer, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { EmptyState, GlassIconButton, Header, Screen, space, Text } from '@/ui';

import { AddItemField } from '../components/AddItemField';
import { DraftItemRow } from '../components/DraftItemRow';
import { SnapPill } from '../components/SnapPill';
import { useAddToPantry } from '../hooks/useAddToPantry';
import { useIngredientMatches } from '../hooks/useIngredientMatches';
import { snapCameraHref } from '../links';
import { draftFromSweep, draftReducer, selectedItems, type DraftItem } from '../logic/pantryDraft';
import { isFromVideo } from '../logic/sweepItems';
import { nameKey } from '../logic/words';
import type { SweepSnapResult } from '../snapSession';

/** Where a sweep lands once its items are in the pantry. */
export const MEALS_ROUTE = '/meals';

type Row =
  | { kind: 'section'; key: string; title: string; count: number }
  | { kind: 'item'; key: string; item: DraftItem };

/** "From the video", then "From what you said" (with anything typed here), each with its rows. */
function rowsFor(items: readonly DraftItem[]): Row[] {
  const video = items.filter(isFromVideo);
  const words = items.filter((item) => !isFromVideo(item));
  const rows: Row[] = [];
  const section = (key: string, title: string, list: DraftItem[]) => {
    if (list.length === 0) return;
    rows.push({ kind: 'section', key, title, count: list.length });
    for (const item of list) rows.push({ kind: 'item', key: item.key, item });
  };
  section('section-video', 'From the video', video);
  section('section-words', 'From what you said', words);
  return rows;
}

function back() {
  if (router.canGoBack()) router.back();
  else router.replace(snapCameraHref({ mode: 'pantry' }));
}

/**
 * "Check the list" after a fridge sweep: what the video saw and what the person said, each row
 * editable, plus anything else typed in. Adding puts the ticked items in the pantry and moves on
 * to the meals they make possible.
 */
export function SweepReview({ result }: { result: SweepSnapResult }) {
  const [items, dispatch] = useReducer(draftReducer, result.items, draftFromSweep);
  const add = useAddToPantry(dispatch);
  const nextKey = useRef(0);
  const names = useMemo(() => items.map((item) => item.name), [items]);
  const { matches, isMatching } = useIngredientMatches(names);
  const rows = useMemo(() => rowsFor(items), [items]);
  const selected = selectedItems(items).length;

  const renderItem = useCallback(
    ({ item: row }: { item: Row }) => {
      if (row.kind === 'section') {
        return (
          <View style={styles.section}>
            <Text variant="sectionLabel" accessibilityRole="header">
              {row.title}
            </Text>
            <Text variant="caption" tone="muted">
              {String(row.count)}
            </Text>
          </View>
        );
      }
      const key = nameKey(row.item.name);
      const match = !key ? null : matches.has(key) ? (matches.get(key)?.name ?? null) : undefined;
      return <DraftItemRow item={row.item} matchName={match} dispatch={dispatch} />;
    },
    [matches],
  );

  const addItem = useCallback((name: string) => {
    nextKey.current += 1;
    dispatch({ type: 'add', key: `mine-${nextKey.current}`, name });
  }, []);

  const addToPantry = () => {
    // Replace, so going back from the meals returns to the camera rather than this list.
    if (add(items, matches)) router.replace(MEALS_ROUTE);
  };

  const found = result.items.length;
  const header = (
    <View style={styles.header}>
      <Header
        title="Check the list"
        size="tab"
        leading={
          <GlassIconButton
            icon="chevron.left"
            accessibilityLabel="Back to the camera"
            onPress={back}
            testID="sweep-review-back"
          />
        }
      />
      <Text tone="muted">
        {found === 0
          ? 'Add what you have, one item at a time.'
          : `${found} ${found === 1 ? 'item' : 'items'} found. Tap to fix a name or amount.`}
      </Text>
      {result.remaining != null ? (
        <Text variant="caption" tone="subtle">
          {result.remaining === 1 ? '1 snap left today' : `${result.remaining} snaps left today`}
        </Text>
      ) : null}
    </View>
  );

  return (
    <Screen
      scroll={false}
      padded={false}
      safeTop
      testID="sweep-review"
      footer={
        <SnapPill
          label={selected === 0 ? 'Select items to add' : `Add ${selected} to pantry`}
          tone="lime"
          onPress={addToPantry}
          // Adding waits for catalog matching, so each item lands under its catalog name.
          disabled={selected === 0 || isMatching}
          testID="sweep-review-add"
        />
      }
    >
      <FlashList
        data={rows}
        renderItem={renderItem}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.kind}
        extraData={matches}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState
            icon="refrigerator"
            title="Nothing on the list yet"
            message="The sweep didn't pick out any food. Add items yourself below, or film again."
          />
        }
        ListFooterComponent={<AddItemField onAdd={addItem} placeholder="Add an item" />}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.sm, paddingBottom: space.sm },
  section: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: space.lg,
    paddingBottom: space.sm,
    paddingHorizontal: space.xxs,
  },
  content: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xl },
});
