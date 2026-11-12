import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { weekStartOf, addDays, dayIndexOf, type IsoDate } from '@/domain/plan';
import type { RecipeSummary } from '@/lib/catalog';
import { usePreferencesStore, useSavedStore } from '@/stores';
import { EmptyState, ErrorState, gutter, Skeleton, SkeletonGroup, space, Text, toast } from '@/ui';

import { ActionSheet } from './ActionSheet';
import { SavedFiltersBar } from './SavedFiltersBar';
import { SavedRecipeCard } from './SavedRecipeCard';
import { SlotPickerSheet } from './SlotPickerSheet';
import { plannerActions, type SlotRef } from '../hooks/usePlanner';
import { useSavedRecipes } from '../hooks/useSavedRecipes';
import {
  DEFAULT_SAVED_FILTERS,
  filterSaved,
  hasActiveFilters,
  type SavedFilters,
} from '../model/savedFilters';
import { defaultSlotFor, SLOT_LABELS, weekDays } from '../model/week';

export interface SavedTabProps {
  /** Rendered above the search field (the Saved | Plan switch). */
  header: ReactNode;
  today: IsoDate;
}

function openRecipe(recipe: RecipeSummary) {
  router.push({ pathname: '/recipe/[id]', params: { id: recipe.id } });
}

/** Saved recipes as a two-column grid with search, filters and per-recipe actions. */
export function SavedTab({ header, today }: SavedTabProps) {
  const saved = useSavedRecipes();
  const smallAppetite = usePreferencesStore((s) => s.prefs.smallAppetite);
  const [chosenFilters, setFilters] = useState<SavedFilters>(DEFAULT_SAVED_FILTERS);
  // The Gentle chip only exists in small appetite mode; when it is hidden its filter is off too.
  const filters = useMemo(
    () => (smallAppetite ? chosenFilters : { ...chosenFilters, gentle: false }),
    [chosenFilters, smallAppetite],
  );
  const [actionsFor, setActionsFor] = useState<RecipeSummary | null>(null);
  const [planning, setPlanning] = useState<RecipeSummary | null>(null);
  const visible = useMemo(() => filterSaved(saved.recipes, filters), [saved.recipes, filters]);
  const { isSafe } = saved;

  // Planning is fail-closed: a recipe that does not pass the current allergen and diet rules never
  // reaches the slot picker or the plan, whatever path asked for it.
  const startPlanning = useCallback(
    (recipe: RecipeSummary) => {
      if (isSafe(recipe)) setPlanning(recipe);
    },
    [isSafe],
  );

  const remove = useCallback((recipe: RecipeSummary) => {
    const { saved: entries, unsave, save } = useSavedStore.getState();
    const savedAt = entries[recipe.id]?.savedAt;
    unsave(recipe.id);
    toast.show({
      message: `Removed ${recipe.title}`,
      action: { label: 'Undo', onPress: () => save(recipe.id, savedAt) },
    });
  }, []);

  const confirmPlan = (recipe: RecipeSummary, target: SlotRef) => {
    setPlanning(null);
    if (!isSafe(recipe)) {
      toast.show({
        message: `${recipe.title} does not fit your allergens or diet`,
        tone: 'danger',
      });
      return;
    }
    if (!plannerActions.place(target, recipe.id)) {
      toast.show({ message: 'That week is archived. Restore it to plan meals.', tone: 'danger' });
      return;
    }
    const day = weekDays(target.week, today)[target.day];
    toast.show({
      message: `Planned for ${day?.short ?? ''} ${SLOT_LABELS[target.slot].toLowerCase()}`,
      tone: 'success',
    });
  };

  const renderItem = useCallback(
    ({ item }: { item: RecipeSummary }) => (
      <SavedRecipeCard
        recipe={item}
        unsafe={!isSafe(item)}
        onOpen={openRecipe}
        onActions={setActionsFor}
        onPlan={startPlanning}
        onRemove={remove}
      />
    ),
    [isSafe, startPlanning, remove],
  );

  const listHeader = (
    <View style={styles.header}>
      {header}
      {saved.ids.length > 0 ? (
        <SavedFiltersBar filters={filters} onChange={setFilters} showGentle={smallAppetite} />
      ) : null}
    </View>
  );

  let empty: ReactNode = null;
  if (saved.isError) {
    empty = <ErrorState error={saved.error} onRetry={() => void saved.refetch()} />;
  } else if (saved.isLoading) {
    empty = <GridSkeleton />;
  } else if (saved.ids.length === 0) {
    empty = (
      <EmptyState
        icon="bookmark"
        title="Nothing saved yet"
        message="Save dishes from Discover or Search and they will wait for you here."
        actionLabel="Find recipes"
        onAction={() => router.push('/search')}
      />
    );
  } else if (hasActiveFilters(filters)) {
    empty = (
      <EmptyState
        icon="magnifyingglass"
        title="No matches"
        message="No saved recipe fits these filters."
        actionLabel="Clear filters"
        onAction={() => setFilters(DEFAULT_SAVED_FILTERS)}
      />
    );
  }

  const thisWeek = weekStartOf(today);
  return (
    <>
      <FlashList
        data={visible}
        numColumns={2}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={empty ? <View style={styles.empty}>{empty}</View> : null}
        ListFooterComponent={
          visible.length > 0 ? (
            <Text variant="footnote" tone="subtle" align="center" style={styles.footer}>
              {visible.length === 1 ? '1 recipe' : `${visible.length} recipes`}
            </Text>
          ) : null
        }
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        testID="saved-grid"
      />
      <ActionSheet
        visible={actionsFor !== null}
        title={actionsFor?.title ?? ''}
        onClose={() => setActionsFor(null)}
        actions={
          actionsFor
            ? [
                ...(isSafe(actionsFor)
                  ? [
                      {
                        key: 'plan',
                        label: 'Add to plan',
                        icon: 'calendar.badge.plus' as const,
                        onPress: () => startPlanning(actionsFor),
                      },
                    ]
                  : []),
                {
                  key: 'open',
                  label: 'Open recipe',
                  icon: 'book',
                  onPress: () => openRecipe(actionsFor),
                },
                {
                  key: 'remove',
                  label: 'Remove from saved',
                  icon: 'bookmark.slash',
                  destructive: true,
                  onPress: () => remove(actionsFor),
                },
              ]
            : []
        }
      />
      {planning ? (
        <SlotPickerSheet
          title="Add to plan"
          description={planning.title}
          confirmLabel="Add to plan"
          weeks={[thisWeek, addDays(thisWeek, 7)]}
          today={today}
          initial={{
            week: thisWeek,
            day: dayIndexOf(today),
            slot: defaultSlotFor(planning.course),
          }}
          onConfirm={(target) => confirmPlan(planning, target)}
          onClose={() => setPlanning(null)}
        />
      ) : null}
    </>
  );
}

function GridSkeleton() {
  return (
    <SkeletonGroup label="Loading saved recipes" style={styles.skeleton}>
      {[0, 1].map((row) => (
        <View key={row} style={styles.skeletonRow}>
          <Skeleton height={180} radius="lg" style={styles.skeletonCell} />
          <Skeleton height={180} radius="lg" style={styles.skeletonCell} />
        </View>
      ))}
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: gutter - space.xs, paddingBottom: space.xxxl },
  header: {
    gap: space.lg,
    paddingHorizontal: space.xs,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  empty: { paddingTop: space.xxl },
  footer: { paddingVertical: space.lg },
  skeleton: { paddingHorizontal: space.xs },
  skeletonRow: { flexDirection: 'row', gap: space.sm },
  skeletonCell: { flex: 1 },
});
