import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  EmptyState,
  ErrorState,
  Skeleton,
  SkeletonGroup,
  Text,
  fontFamily,
  gutter,
  space,
  useTheme,
} from '@/ui';

import { CompareHeader, DeltaTable, DiffRow, type DiffEdge } from '../components/CompareRows';
import { RecipePageHeader } from '../components/RecipePageHeader';
import { SafetyWarning } from '../components/SafetyWarning';
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
  | { type: 'safety'; key: 'safety' }
  | { type: 'heading'; key: string; title: string }
  | { type: 'deltas'; key: 'deltas' }
  | { type: 'diff'; key: string; entry: DiffEntry; edge: DiffEdge };

/** Diff rows of one section, each marked with where it sits in the section's white card. */
function diffRows(entries: readonly DiffEntry[]): Row[] {
  return entries.map((entry, index) => {
    const first = index === 0;
    const last = index === entries.length - 1;
    const edge: DiffEdge = first && last ? 'single' : first ? 'top' : last ? 'bottom' : 'middle';
    return { type: 'diff', key: `d-${entry.key}`, entry, edge };
  });
}

function rowsFor(state: Ready): Row[] {
  const changed = state.diff.filter((d) => d.kind !== 'same');
  const same = state.diff.filter((d) => d.kind === 'same');
  const rows: Row[] = [{ type: 'header', key: 'header' }];
  if (!state.safety.eligible) rows.push({ type: 'safety', key: 'safety' });
  rows.push(
    { type: 'heading', key: 'h-nutrition', title: 'Nutrition' },
    { type: 'deltas', key: 'deltas' },
  );
  if (changed.length > 0) {
    rows.push({ type: 'heading', key: 'h-changed', title: 'What changed' });
    rows.push(...diffRows(changed));
  }
  if (same.length > 0) {
    rows.push({ type: 'heading', key: 'h-same', title: 'Stays the same' });
    rows.push(...diffRows(same));
  }
  return rows;
}

/**
 * An original dish next to its healthier version, under a glass back header: the two versions on
 * one white card, nutrition per serving, and the ingredient changes grouped on white cards.
 */
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
        case 'safety':
          return (
            <View style={styles.safety}>
              <SafetyWarning
                verdict={state.safety}
                subject={`About ${state.adapted.title}, the healthier version:`}
              />
            </View>
          );
        case 'heading':
          return (
            <Text variant="label" accessibilityRole="header" style={styles.heading}>
              {item.title}
            </Text>
          );
        case 'deltas':
          return <DeltaTable deltas={state.deltas} />;
        case 'diff':
          return <DiffRow entry={item.entry} edge={item.edge} />;
      }
    },
    [state],
  );

  const background = { backgroundColor: theme.colors.background };
  const back = () => {
    if (router.canGoBack()) router.back();
    else if (fromId) router.replace(recipeHref(fromId));
  };
  const header = (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <RecipePageHeader title="Compare" onBack={back} />
    </>
  );

  if (state.status === 'loading') {
    return (
      <View style={[styles.flex, background]}>
        {header}
        <SkeletonGroup style={styles.pad} label="Loading comparison">
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
      <View style={[styles.flex, background]}>
        {header}
        <View style={[styles.flex, styles.centre]}>
          <ErrorState error={state.error} onRetry={state.retry} />
        </View>
      </View>
    );
  }
  if (state.status === 'missing') {
    return (
      <View style={[styles.flex, background]}>
        {header}
        <View style={[styles.flex, styles.centre]}>
          <EmptyState
            title="Nothing to compare"
            message="We couldn't find that recipe."
            icon="arrow.left.arrow.right"
          />
        </View>
      </View>
    );
  }
  if (state.status === 'alone') {
    const recipe = state.recipe;
    return (
      <View style={[styles.flex, background]}>
        {header}
        <View style={[styles.flex, styles.centre]}>
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
      </View>
    );
  }

  return (
    <View style={[styles.flex, background]}>
      {header}
      <FlashList
        data={rows}
        renderItem={renderItem}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.type}
        extraData={state}
        contentInsetAdjustmentBehavior="never"
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
  safety: { paddingTop: space.md },
  heading: { fontFamily: fontFamily.textBold, paddingTop: space.section, paddingBottom: space.sm },
});
