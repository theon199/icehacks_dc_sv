import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { localIsoDate } from '@/domain/plan';
import { selectUnits, useSettingsStore } from '@/stores/settings';
import { useShoppingStore } from '@/stores/shopping';
import {
  EmptyState,
  ErrorState,
  Icon,
  PressableScale,
  SkeletonGroup,
  Skeleton,
  Text,
  gutter,
  space,
  useTheme,
} from '@/ui';

import { CheckRow } from '../components/CheckRow';
import { ShoppingHeader } from '../components/ShoppingHeader';
import { rangeFor, rangeLabel, type RangePreset } from '../planRange';
import { shoppingRows, type ShoppingRow } from '../rows';
import { toCheckState } from '../shareText';
import { useShoppingActions } from '../useShoppingActions';
import { useShoppingList } from '../useShoppingList';

function Heading({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.heading} accessibilityRole="header">
      <Text variant="headline">{title}</Text>
      <Text variant="footnote" tone="subtle">
        {count}
      </Text>
    </View>
  );
}

function PantryToggle({
  count,
  open,
  onPress,
}: {
  count: number;
  open: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      testID="shopping-pantry-toggle"
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`Already in your pantry, ${count} items`}
      onPress={onPress}
      style={styles.heading}
    >
      <Text variant="headline">Already in your pantry</Text>
      <View style={styles.toggleEnd}>
        <Text variant="footnote" tone="subtle">
          {count}
        </Text>
        <Icon name={open ? 'chevron.up' : 'chevron.down'} size={14} color="textSubtle" />
      </View>
    </PressableScale>
  );
}

function summaryFor(meals: number, toBuy: number, missing: number): string {
  const parts = [
    `${meals} planned ${meals === 1 ? 'meal' : 'meals'}`,
    `${toBuy} ${toBuy === 1 ? 'item' : 'items'} to buy`,
  ];
  if (missing > 0) parts.push(`${missing} recipe${missing === 1 ? '' : 's'} unavailable`);
  return parts.join(' · ');
}

/** The shopping list for the planned meals in a chosen range of days. */
export function ShoppingScreen() {
  const theme = useTheme();
  const [today] = useState(() => localIsoDate(new Date()));
  const [preset, setPreset] = useState<RangePreset>('thisWeek');
  const [showPantry, setShowPantry] = useState(false);
  const range = useMemo(() => rangeFor(preset, today), [preset, today]);
  const { status, list, plannedMeals, error, retry } = useShoppingList(range);
  const system = useSettingsStore(selectUnits);
  const checked = useShoppingStore((state) => state.checked);
  const toggle = useShoppingStore((state) => state.toggle);
  const actions = useShoppingActions({ list, title: `Shopping list · ${rangeLabel(range)}` });

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
          return <Heading title={row.title} count={row.count} />;
        case 'check':
          return (
            <CheckRow
              id={row.key}
              title={row.title}
              subtitle={row.subtitle}
              checked={row.checked}
              onToggle={toggle}
            />
          );
        case 'pantryToggle':
          return (
            <PantryToggle
              count={row.count}
              open={showPantry}
              onPress={() => setShowPantry((open) => !open)}
            />
          );
        case 'pantryItem':
          return (
            <Text variant="callout" tone="muted" style={styles.pantryItem}>
              {row.title}
            </Text>
          );
      }
    },
    [toggle, showPantry],
  );

  let empty;
  if (status === 'loading') {
    empty = (
      <SkeletonGroup label="Building your list">
        <Skeleton height={20} width="40%" />
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </SkeletonGroup>
    );
  } else if (status === 'error') {
    empty = <ErrorState error={error} onRetry={retry} />;
  } else if (status === 'empty' && actions.extras.length === 0) {
    empty = (
      <EmptyState
        icon="calendar"
        title="Nothing planned for these days"
        message="Plan a few meals and everything they need will show up here, minus what’s in your pantry."
        actionLabel="Plan meals"
        onAction={() => router.push('/cookbook')}
      />
    );
  }

  // Nothing left to buy is told apart from nothing to build a list from: every planned recipe
  // having left the catalog is not the same as the pantry covering everything.
  let nothingToBuy = null;
  if (status === 'ready' && list && list.items.length === 0 && actions.extras.length === 0) {
    nothingToBuy =
      list.mealCount === 0 ? (
        <EmptyState
          icon="calendar"
          title="These recipes aren’t available"
          message="The meals planned for these days are no longer in the recipe collection. Swap them in your plan to build a list."
          actionLabel="Open plan"
          onAction={() => router.push('/cookbook')}
        />
      ) : (
        <EmptyState
          icon="checkmark.seal"
          title="You have everything"
          message="Your pantry covers every planned meal."
        />
      );
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <FlashList
        data={status === 'loading' || status === 'error' ? [] : rows}
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
              toBuy={list?.items ?? []}
              checkedCount={tickedOnList}
              canShare={actions.canShare}
              onShare={actions.share}
              onMarkBought={actions.markBought}
              onClearTicks={actions.clearTicks}
              onAddExtra={actions.addExtra}
            />
            {nothingToBuy}
          </>
        }
        ListEmptyComponent={empty}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: gutter, paddingBottom: space.xxxl },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingTop: space.lg,
    paddingBottom: space.xs,
  },
  toggleEnd: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  pantryItem: { paddingVertical: space.xs, paddingLeft: space.xxxl },
});
