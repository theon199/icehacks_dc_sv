import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  EmptyState,
  ErrorState,
  Skeleton,
  SkeletonGroup,
  Text,
  gutter,
  space,
  useTheme,
} from '@/ui';

import { CompareHeader, DeltaTable, DiffRow } from '../components/CompareRows';
import { useCanUseAi } from '../deps';
import { useComparison, type ComparisonState } from '../hooks/useComparison';
import { aiConsentHref, makeoverHref, recipeHref } from '../links';
import type { DiffEntry } from '../model/compare';

export interface CompareScreenProps {
  fromId?: string | undefined;
  toId?: string | undefined;
}

type Ready = Extract<ComparisonState, { status: 'ready' }>;

type Row =
  | { type: 'header'; key: 'header' }
  | { type: 'heading'; key: string; title: string }
  | { type: 'deltas'; key: 'deltas' }
  | { type: 'diff'; key: string; entry: DiffEntry };

function rowsFor(state: Ready): Row[] {
  const changed = state.diff.filter((d) => d.kind !== 'same');
  const same = state.diff.filter((d) => d.kind === 'same');
  const rows: Row[] = [
    { type: 'header', key: 'header' },
    { type: 'heading', key: 'h-nutrition', title: 'Nutrition' },
    { type: 'deltas', key: 'deltas' },
  ];
  if (changed.length > 0) {
    rows.push({ type: 'heading', key: 'h-changed', title: 'What changed' });
    for (const entry of changed) rows.push({ type: 'diff', key: `d-${entry.key}`, entry });
  }
  if (same.length > 0) {
    rows.push({ type: 'heading', key: 'h-same', title: 'Stays the same' });
    for (const entry of same) rows.push({ type: 'diff', key: `d-${entry.key}`, entry });
  }
  return rows;
}

/** An original dish next to its healthier version: nutrition per serving and ingredient changes. */
export function CompareScreen({ fromId, toId }: CompareScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const state = useComparison(fromId, toId);
  const canUseAi = useCanUseAi();
  const rows = useMemo(() => (state.status === 'ready' ? rowsFor(state) : []), [state]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Row>) => {
      if (state.status !== 'ready') return null;
      switch (item.type) {
        case 'header':
          return (
            <CompareHeader
              original={state.original}
              adapted={state.adapted}
              personal={state.personal}
              summary={state.summary}
            />
          );
        case 'heading':
          return (
            <Text variant="title3" accessibilityRole="header" style={styles.heading}>
              {item.title}
            </Text>
          );
        case 'deltas':
          return <DeltaTable deltas={state.deltas} />;
        case 'diff':
          return <DiffRow entry={item.entry} />;
      }
    },
    [state],
  );

  const background = { backgroundColor: theme.colors.background };

  if (state.status === 'loading') {
    return (
      <View style={[styles.flex, styles.pad, background]}>
        <SkeletonGroup label="Loading comparison">
          <Skeleton height={80} radius="lg" />
          <Skeleton height={220} radius="lg" />
          <Skeleton height={40} />
          <Skeleton height={40} />
        </SkeletonGroup>
      </View>
    );
  }
  if (state.status === 'error') {
    return (
      <View style={[styles.flex, styles.centre, background]}>
        <ErrorState error={state.error} onRetry={state.retry} />
      </View>
    );
  }
  if (state.status === 'missing') {
    return (
      <View style={[styles.flex, styles.centre, background]}>
        <EmptyState
          title="Nothing to compare"
          message="We couldn't find that recipe."
          icon="arrow.left.arrow.right"
        />
      </View>
    );
  }
  if (state.status === 'alone') {
    const recipe = state.recipe;
    return (
      <View style={[styles.flex, styles.centre, background]}>
        <EmptyState
          title="No healthier version yet"
          message={`There is only one version of ${recipe.title} so far. Make your own and compare them here.`}
          icon="sparkles"
          actionLabel="Make it healthier"
          onAction={() => router.push(canUseAi ? makeoverHref(recipe.id) : aiConsentHref)}
        >
          <Button
            label="Back to the recipe"
            variant="ghost"
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace(recipeHref(recipe.id))
            }
          />
        </EmptyState>
      </View>
    );
  }

  return (
    <View style={[styles.flex, background]}>
      <FlashList
        data={rows}
        renderItem={renderItem}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.type}
        extraData={state}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.list}
        testID="compare-list"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: gutter },
  centre: { justifyContent: 'center', padding: gutter },
  list: { paddingHorizontal: gutter, paddingBottom: space.xxxl },
  heading: { paddingTop: space.xl, paddingBottom: space.sm },
});
