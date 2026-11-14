import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { Stack, router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { localIsoDate } from '@/domain/plan';
import { selectUnits, useSettingsStore } from '@/stores/settings';
import { useShoppingStore } from '@/stores/shopping';
import {
  HEADER_TOP_OFFSET,
  Skeleton,
  SkeletonGroup,
  errorMessageFor,
  gutter,
  space,
  useTheme,
} from '@/ui';

import { CheckRow } from '../components/CheckRow';
import { NoticeCard } from '../components/NoticeCard';
import { PantryLine, PantryToggle, SectionHeading } from '../components/SectionRows';
import { ShoppingFooter } from '../components/ShoppingFooter';
import { ShoppingHeader } from '../components/ShoppingHeader';
import { rangeFor, rangeLabel, type RangePreset } from '../planRange';
import { shoppingRows, type ShoppingRow } from '../rows';
import { toCheckState } from '../shareText';
import { useShoppingActions } from '../useShoppingActions';
import { useShoppingList } from '../useShoppingList';

function summaryFor(meals: number, toBuy: number, missing: number): string {
  const parts = [
    `${meals} planned ${meals === 1 ? 'meal' : 'meals'}`,
    `${toBuy} ${toBuy === 1 ? 'item' : 'items'} to buy`,
  ];
  if (missing > 0) parts.push(`${missing} recipe${missing === 1 ? '' : 's'} unavailable`);
  return parts.join(' · ');
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/cookbook');
}

const openPlan = () => router.push('/cookbook');
const openPantry = () => router.push('/pantry');

/** The shopping list for the planned meals in a chosen range of days, one card per aisle. */
export function ShoppingScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [today] = useState(() => localIsoDate(new Date()));
  const [preset, setPreset] = useState<RangePreset>('thisWeek');
  const [showPantry, setShowPantry] = useState(false);
  const range = useMemo(() => rangeFor(preset, today), [preset, today]);
  const { status, list, plannedMeals, error, retry } = useShoppingList(range);
  const system = useSettingsStore(selectUnits);
  const checked = useShoppingStore((state) => state.checked);
  const toggle = useShoppingStore((state) => state.toggle);
  const actions = useShoppingActions({ list, title: `Shopping list · ${rangeLabel(range)}` });
  const togglePantry = useCallback(() => setShowPantry((open) => !open), []);

  const rows = useMemo(
    () =>
      shoppingRows({
        groups: list?.groups ?? [],
        inPantry: list?.inPantry ?? [],
        extras: actions.extras,
        checks: toCheckState(checked),
        system,
        showPantry,
      }),
    [list, actions.extras, checked, system, showPantry],
  );
  const tickedOnList = rows.filter((row) => row.type === 'check' && row.checked).length;

  const renderItem = useCallback(
    ({ item: row }: ListRenderItemInfo<ShoppingRow>) => {
      switch (row.type) {
        case 'heading':
          return <SectionHeading title={row.title} count={row.count} />;
        case 'check':
          return (
            <CheckRow
              id={row.key}
              title={row.title}
              subtitle={row.subtitle}
              checked={row.checked}
              closes={row.closes}
              onToggle={toggle}
            />
          );
        case 'pantryToggle':
          return <PantryToggle count={row.count} open={showPantry} onPress={togglePantry} />;
        case 'pantryItem':
          return <PantryLine title={row.title} closes={row.closes} />;
      }
    },
    [toggle, showPantry, togglePantry],
  );

  let empty = null;
  if (status === 'loading') {
    empty = (
      <SkeletonGroup label="Building your list">
        <View style={styles.skeleton}>
          <Skeleton height={180} radius="card" />
          <Skeleton height={120} radius="card" />
        </View>
      </SkeletonGroup>
    );
  } else if (status === 'error') {
    empty = (
      <NoticeCard
        alert
        title="Something didn’t load"
        message={errorMessageFor(error)}
        actionLabel="Try again"
        onAction={retry}
      />
    );
  } else if (status === 'empty' && actions.extras.length === 0) {
    empty = (
      <NoticeCard
        title="Nothing planned for these days"
        message="Plan a few meals and everything they need will show up here, minus what’s in your pantry."
        actionLabel="Plan meals"
        onAction={openPlan}
      />
    );
  }

  // Nothing left to buy is told apart from nothing to build a list from: every planned recipe
  // having left the catalog is not the same as the pantry covering everything.
  let nothingToBuy = null;
  if (status === 'ready' && list && list.items.length === 0 && actions.extras.length === 0) {
    nothingToBuy =
      list.mealCount === 0 ? (
        <NoticeCard
          title="These recipes aren’t available"
          message="The meals planned for these days are no longer in the recipe collection. Swap them in your plan to build a list."
          actionLabel="Open plan"
          onAction={openPlan}
        />
      ) : (
        <NoticeCard title="You have everything" message="Your pantry covers every planned meal." />
      );
  }

  const settled = status === 'ready' || status === 'empty';

  return (
    <View
      style={[styles.flex, { paddingTop: insets.top, backgroundColor: theme.colors.background }]}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <FlashList
        data={settled ? rows : []}
        renderItem={renderItem}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.type}
        extraData={showPantry}
        ListHeaderComponent={
          <>
            <ShoppingHeader
              preset={preset}
              onPresetChange={setPreset}
              rangeText={rangeLabel(range)}
              summary={
                list
                  ? summaryFor(plannedMeals, list.items.length, list.missingRecipeIds.length)
                  : null
              }
              onBack={goBack}
            />
            {nothingToBuy}
          </>
        }
        ListEmptyComponent={empty}
        ListFooterComponent={
          settled ? (
            <ShoppingFooter
              toBuy={list?.items ?? []}
              checkedCount={tickedOnList}
              canShare={actions.canShare}
              onShare={actions.share}
              onMarkBought={actions.markBought}
              onClearTicks={actions.clearTicks}
              onAddExtra={actions.addExtra}
              onOpenPantry={openPantry}
            />
          ) : null
        }
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingTop: HEADER_TOP_OFFSET,
          paddingBottom: insets.bottom + space.xl,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  skeleton: { gap: space.md, marginTop: space.md },
});
