import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { dietMask, useRecipeSearch, type RecipeSummary } from '@/lib/catalog';
import { usePreferencesStore } from '@/stores';
import {
  EmptyState,
  ErrorState,
  GlassSheet,
  maxFontSizeMultiplier,
  space,
  Text,
  typography,
  useTheme,
} from '@/ui';

import { RecipePickRow } from './RecipePickRow';
import { useSavedRecipes } from '../hooks/useSavedRecipes';

export interface AddMealSheetProps {
  /** The slot being filled, lower case: "dinner". */
  slot: string;
  /** The day it belongs to: "Saturday Nov 14". */
  dayLabel: string;
  onPick: (recipe: RecipeSummary) => void;
  onClose: () => void;
}

/**
 * Up to this many rows render in place and the sheet hugs them. A longer list moves into a
 * recycled list on a fixed-height sheet, so a big library never renders all at once.
 */
const INLINE_ROWS = 12;
/** The fixed height a long list gets. */
const LIST_HEIGHT = 0.85;

/**
 * Choose a recipe for an empty slot. With the search field empty it offers the person's saved
 * recipes; typing searches the whole catalog. Only recipes that pass the person's allergen and diet
 * rules are offered. Mount it only while open: closing slides the sheet away, then `onClose` runs.
 */
export function AddMealSheet({ slot, dayLabel, onPick, onClose }: AddMealSheetProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(true);
  const saved = useSavedRecipes();
  const [query, setQuery] = useState('');
  const searching = query.trim() !== '';
  const prefs = usePreferencesStore((s) => s.prefs);
  const filters = useMemo(
    () => ({ avoidAllergens: prefs.allergens, dietMask: dietMask(prefs.diets) }),
    [prefs.allergens, prefs.diets],
  );
  const search = useRecipeSearch(searching ? query : '', filters);
  const { isSafe } = saved;

  const results = useMemo(() => {
    const list = searching ? (search.data?.pages.flatMap((p) => p.items) ?? []) : saved.recipes;
    return list.filter(isSafe);
  }, [searching, search.data, saved.recipes, isSafe]);

  const renderItem = useCallback(
    ({ item }: { item: RecipeSummary }) => <RecipePickRow recipe={item} onPick={onPick} />,
    [onPick],
  );

  const loading = searching ? search.isPending : saved.isLoading;
  const error = searching ? search.error : saved.error;
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
  else if (searching) empty = <EmptyState icon="magnifyingglass" title="No recipes found" />;
  else {
    empty = (
      <Text variant="subhead" tone="muted">
        No saved recipes yet. Search above to find one.
      </Text>
    );
  }

  const inline = results.length <= INLINE_ROWS || !prefs.allergensAnswered;
  const heading = searching ? null : (
    <Text variant="sectionLabel" tone="muted" accessibilityRole="header" style={styles.groupLabel}>
      Your saved recipes
    </Text>
  );

  return (
    <GlassSheet
      visible={open}
      onClose={() => setOpen(false)}
      onClosed={onClose}
      title={`Add ${slot}`}
      description={dayLabel}
      closeLabel="Close"
      {...(inline ? {} : { heightRatio: LIST_HEIGHT })}
      scroll={inline}
      testID="add-meal-sheet"
    >
      <TextInput
        accessibilityLabel="Search recipes"
        placeholder="Search all recipes"
        placeholderTextColor={theme.colors.textSubtle}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
        selectionColor={theme.colors.primary}
        keyboardAppearance={theme.scheme}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        testID="add-meal-search"
        style={[
          styles.search,
          {
            color: theme.colors.text,
            backgroundColor: theme.colors.surfaceSunken,
            borderColor: theme.colors.border,
            borderRadius: theme.radii.lg,
          },
        ]}
      />
      {inline ? (
        <View style={styles.stack}>
          {heading}
          {results.length === 0 || !prefs.allergensAnswered
            ? empty
            : results.map((recipe) => (
                <RecipePickRow key={recipe.id} recipe={recipe} onPick={onPick} />
              ))}
        </View>
      ) : (
        <View style={styles.list}>
          <FlashList
            data={results}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            ItemSeparatorComponent={RowGap}
            ListHeaderComponent={<View style={styles.listHeader}>{heading}</View>}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onEndReached={() => {
              if (searching && search.hasNextPage && !search.isFetchingNextPage) {
                void search.fetchNextPage();
              }
            }}
            ListEmptyComponent={<View style={styles.empty}>{empty}</View>}
          />
        </View>
      )}
    </GlassSheet>
  );
}

function RowGap() {
  return <View style={styles.gap} />;
}

const styles = StyleSheet.create({
  search: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.lg,
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
  },
  stack: { gap: space.sm },
  groupLabel: { marginTop: space.xs },
  list: { flex: 1 },
  listHeader: { paddingBottom: space.sm },
  gap: { height: space.sm },
  empty: { paddingTop: space.xxl },
});
