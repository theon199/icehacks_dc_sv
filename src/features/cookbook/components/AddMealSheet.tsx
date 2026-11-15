import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { dietMask, useRecipeSearch, type RecipeSummary } from '@/lib/catalog';
import { usePreferencesStore } from '@/stores';
import { EmptyState, ErrorState, GlassSheet, SegmentedControl, space, TextField } from '@/ui';

import { RecipePickRow } from './RecipePickRow';
import { useSavedRecipes } from '../hooks/useSavedRecipes';
import { DEFAULT_SAVED_FILTERS, filterSaved } from '../model/savedFilters';

type Source = 'saved' | 'search';

export interface AddMealSheetProps {
  /** e.g. "Tuesday dinner". */
  title: string;
  onPick: (recipe: RecipeSummary) => void;
  onClose: () => void;
}

/**
 * Choose a recipe for an empty slot, from saved recipes or the whole catalog. Only recipes that
 * pass the person's allergen and diet rules are offered. Mount it only while open: closing slides
 * the sheet away first, then `onClose` runs.
 */
export function AddMealSheet({ title, onPick, onClose }: AddMealSheetProps) {
  const [open, setOpen] = useState(true);
  const saved = useSavedRecipes();
  const [source, setSource] = useState<Source>(saved.ids.length > 0 ? 'saved' : 'search');
  const [query, setQuery] = useState('');
  const prefs = usePreferencesStore((s) => s.prefs);
  const filters = useMemo(
    () => ({ avoidAllergens: prefs.allergens, dietMask: dietMask(prefs.diets) }),
    [prefs.allergens, prefs.diets],
  );
  const search = useRecipeSearch(source === 'search' ? query : '', filters);
  const { isSafe } = saved;

  const results = useMemo(() => {
    const list =
      source === 'saved'
        ? filterSaved(saved.recipes, { ...DEFAULT_SAVED_FILTERS, query })
        : (search.data?.pages.flatMap((p) => p.items) ?? []);
    return list.filter(isSafe);
  }, [source, saved.recipes, query, search.data, isSafe]);

  const renderItem = useCallback(
    ({ item }: { item: RecipeSummary }) => <RecipePickRow recipe={item} onPick={onPick} />,
    [onPick],
  );

  const loading = source === 'search' ? search.isPending : saved.isLoading;
  const error = source === 'search' ? search.error : saved.error;
  let empty = null;
  if (!prefs.allergensAnswered) {
    // Nothing is known to be safe until allergens are answered, so an empty list is not "no match".
    empty = (
      <EmptyState
        icon="checkmark.shield"
        title="Tell us about allergies first"
        message="Only recipes we know are safe for you can be planned. Answer the allergen question in Preferences."
        actionLabel="Open preferences"
        onAction={() => {
          onClose();
          router.push('/preferences');
        }}
      />
    );
  } else if (error) empty = <ErrorState error={error} />;
  else if (loading) empty = <ActivityIndicator accessibilityLabel="Loading recipes" />;
  else if (source === 'saved' && saved.ids.length === 0) {
    empty = (
      <EmptyState
        icon="bookmark"
        title="No saved recipes"
        message="Search the catalog instead."
        actionLabel="Search recipes"
        onAction={() => setSource('search')}
      />
    );
  } else empty = <EmptyState icon="magnifyingglass" title="No recipes found" />;

  return (
    <GlassSheet
      visible={open}
      onClose={() => setOpen(false)}
      onClosed={onClose}
      title={`Add ${title}`}
      closeLabel="Close"
      heightRatio={SHEET_HEIGHT}
      scroll={false}
      testID="add-meal-sheet"
    >
      <View style={styles.controls}>
        <SegmentedControl
          accessibilityLabel="Recipe source"
          segments={[
            { value: 'saved', label: 'Saved' },
            { value: 'search', label: 'All recipes' },
          ]}
          value={source}
          onChange={setSource}
        />
        <TextField
          label={source === 'saved' ? 'Search saved recipes' : 'Search all recipes'}
          icon="magnifyingglass"
          value={query}
          onChangeText={setQuery}
          clearable
          autoCorrect={false}
          returnKeyType="search"
          testID="add-meal-search"
        />
      </View>
      <View style={styles.list}>
        <FlashList
          data={results}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onEndReached={() => {
            if (source === 'search' && search.hasNextPage && !search.isFetchingNextPage) {
              void search.fetchNextPage();
            }
          }}
          ListEmptyComponent={<View style={styles.empty}>{empty}</View>}
        />
      </View>
    </GlassSheet>
  );
}

/** A list of any length, so the sheet takes a fixed height instead of hugging its content. */
const SHEET_HEIGHT = 0.85;

const styles = StyleSheet.create({
  controls: { gap: space.md },
  list: { flex: 1 },
  empty: { paddingTop: space.xxl },
});
