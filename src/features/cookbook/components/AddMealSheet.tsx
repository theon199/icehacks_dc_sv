import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { dietMask, useRecipeSearch, type RecipeSummary } from '@/lib/catalog';
import { usePreferencesStore } from '@/stores';
import {
  EmptyState,
  ErrorState,
  gutter,
  IconButton,
  SegmentedControl,
  space,
  Text,
  TextField,
  useTheme,
} from '@/ui';

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
 * pass the person's allergen and diet rules are offered.
 */
export function AddMealSheet({ title, onPick, onClose }: AddMealSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
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
  if (error) empty = <ErrorState error={error} />;
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
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View
        style={[styles.root, { backgroundColor: theme.colors.surface }]}
        testID="add-meal-sheet"
      >
        <View style={styles.top}>
          <Text variant="title3" style={styles.flex} accessibilityRole="header">
            {`Add ${title}`}
          </Text>
          <IconButton icon="xmark" accessibilityLabel="Close" onPress={onClose} variant="tinted" />
        </View>
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
          contentContainerStyle={{
            paddingHorizontal: gutter,
            paddingBottom: insets.bottom + space.lg,
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: gutter,
    paddingTop: space.lg,
    gap: space.sm,
  },
  controls: { padding: gutter, gap: space.md },
  empty: { paddingTop: space.xxl },
});
