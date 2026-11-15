import { Stack, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { SearchBarCommands } from 'react-native-screens';

import { cuisineLabel, DIET_LABELS } from '@/domain/types';
import { tokenize } from '@/lib/catalog';
import { EmptyState, ErrorState, gutter, space } from '@/ui';

import { AskChefCard } from './AskChefCard';
import { CuisineGrid } from './CuisineGrid';
import { FilterBar } from './FilterBar';
import { NoResults } from './NoResults';
import { RecentSearches } from './RecentSearches';
import { TopResultCard } from './ResultCard';
import { ResultsList } from './ResultsList';
import { ResultsSkeleton } from './ResultsSkeleton';
import { SafetyNotice } from './SafetyNotice';
import { SearchErrorBanner } from './SearchErrorBanner';
import { SectionHeading, TermRow } from './SearchRows';
import { useAiAccess, useLovedCuisines, useSearchOwnerId } from '../deps';
import { activeFilterChips, toggleValue, type ActiveFilterChip } from '../filters';
import { useRecentSearches, useRecentSearchesStore } from '../recentSearches';
import type { SearchResultItem } from '../resultItems';
import { useSearchStore } from '../searchStore';
import { STARTER_TERMS } from '../suggestions';
import { useSearchResults } from '../useSearchResults';

/** How many results lead as large cards before the plain rows. */
export const TOP_RESULTS = 5;

/**
 * The Search side of the Ask page. At rest: the way into Chef, cuisines to browse and the
 * healthiest recipes. The field is the system one the tab bar's search island expands into;
 * focusing it shows recent searches, typing shows results: the filter chips, the top results as
 * cards and the rest as rows.
 */
export function SearchPane() {
  const router = useRouter();
  const query = useSearchStore((state) => state.query);
  const filters = useSearchStore((state) => state.filters);
  const setQuery = useSearchStore((state) => state.setQuery);
  const setMode = useSearchStore((state) => state.setMode);
  const setFilters = useSearchStore((state) => state.setFilters);
  const resetFilters = useSearchStore((state) => state.resetFilters);
  const results = useSearchResults();
  const [focused, setFocused] = useState(false);
  const field = useRef<SearchBarCommands>(null);

  const ownerId = useSearchOwnerId();
  const recentTerms = useRecentSearches(ownerId);
  const recordRecent = useRecentSearchesStore((state) => state.record);
  const removeRecent = useRecentSearchesStore((state) => state.remove);
  const clearRecents = useRecentSearchesStore((state) => state.clear);
  const lovedCuisines = useLovedCuisines();
  const canAskChef = useAiAccess() === 'allowed';

  const remember = useCallback(
    (term: string) => {
      if (ownerId && tokenize(term).length > 0) recordRecent(ownerId, term);
    },
    [ownerId, recordRecent],
  );

  // The native field keeps its own text, so a search started from a row is written into it too.
  const runSearch = useCallback(
    (term: string) => {
      setQuery(term);
      field.current?.setText(term);
      remember(term);
    },
    [setQuery, remember],
  );

  // The list shows results for the settled text, which can lag behind what is still being typed;
  // the recent search is the one that found the recipe.
  const { settledQuery } = results;
  const openRecipe = useCallback(
    (item: SearchResultItem) => {
      remember(settledQuery);
      router.push({ pathname: '/recipe/[id]', params: { id: item.recipe.id } });
    },
    [remember, router, settledQuery],
  );

  const chips = useMemo(
    () => activeFilterChips(filters, cuisineLabel, (diet) => DIET_LABELS[diet]),
    [filters],
  );
  const openFilters = useCallback(() => router.push('/search/filters'), [router]);
  const pickCuisine = useCallback(
    (cuisine: string) =>
      setFilters({
        ...filters,
        cuisines: filters.cuisines.includes(cuisine)
          ? filters.cuisines
          : toggleValue(filters.cuisines, cuisine),
      }),
    [filters, setFilters],
  );

  const setUpSafety = () => router.push('/preferences');
  // Results already on screen stay usable when a later load fails; the banner says what is missing.
  const errorBanner =
    results.error && results.items.length > 0 ? (
      <SearchErrorBanner error={results.error} onRetry={results.retry} />
    ) : null;
  const safetyNotice = results.safetyAnswered ? null : <SafetyNotice onSetUp={setUpSafety} />;
  const showRecents = focused && query.trim().length === 0;

  let header: ReactNode;
  let rows: readonly SearchResultItem[] = results.items;
  if (showRecents) {
    rows = [];
    header = (
      <View style={styles.stack}>
        <RecentSearches
          terms={recentTerms}
          onPick={runSearch}
          onRemove={(term) => {
            if (ownerId) removeRecent(ownerId, term);
          }}
          onClear={clearRecents}
        />
        <View>
          <SectionHeading title="Try searching" />
          {STARTER_TERMS.map((term) => (
            <TermRow
              key={term}
              term={term}
              subtitle="Search"
              accessibilityLabel={`Search for ${term}`}
              onPress={() => runSearch(term)}
            />
          ))}
        </View>
      </View>
    );
  } else if (results.active) {
    const top = results.items.slice(0, TOP_RESULTS);
    rows = results.items.slice(TOP_RESULTS);
    header = (
      <View style={styles.results}>
        {errorBanner}
        {safetyNotice}
        <View style={styles.bleed}>
          <FilterBar
            chips={chips}
            onOpenFilters={openFilters}
            onRemove={(chip: ActiveFilterChip) => setFilters(chip.remove(filters))}
            onClearAll={resetFilters}
          />
        </View>
        {top.length > 0 ? (
          <View style={styles.section}>
            <SectionHeading title="Top Results" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={styles.bleed}
              contentContainerStyle={styles.topRow}
            >
              {top.map((item) => (
                <TopResultCard key={item.recipe.id} item={item} onOpen={openRecipe} />
              ))}
            </ScrollView>
          </View>
        ) : null}
        {rows.length > 0 ? <SectionHeading title="Recipes" /> : null}
      </View>
    );
  } else {
    header = (
      <View style={styles.stack}>
        {safetyNotice}
        <AskChefCard onPress={() => setMode('chef')} />
        <CuisineGrid loved={lovedCuisines} onPick={pickCuisine} />
        {results.items.length > 0 ? <SectionHeading title="Healthiest first" /> : null}
      </View>
    );
  }

  let empty: ReactNode = null;
  if (showRecents || results.items.length > 0) empty = null;
  else if (results.loading) empty = <ResultsSkeleton />;
  else if (results.error) {
    empty = <ErrorState error={results.error} title="Search didn't load" onRetry={results.retry} />;
  } else if (results.active) {
    empty = (
      <NoResults
        query={results.settledQuery}
        hasFilters={results.hasFilters}
        onSearch={runSearch}
        onClearFilters={resetFilters}
        onAskChef={canAskChef ? () => setMode('chef') : undefined}
      />
    );
  } else {
    empty = (
      <EmptyState
        icon="book.closed"
        title="Nothing to show yet"
        message="Recipes will appear here as soon as the collection is ready."
      />
    );
  }

  return (
    <View style={styles.flex}>
      {/* The field the tab bar's search island expands into; it leaves with this pane. */}
      <Stack.SearchBar
        ref={field}
        placeholder="Search recipes"
        placement="automatic"
        allowToolbarIntegration
        autoCapitalize="none"
        hideWhenScrolling={false}
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
        onSearchButtonPress={(event) => remember(event.nativeEvent.text)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onCancelButtonPress={() => {
          setQuery('');
          setFocused(false);
        }}
      />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="slider.horizontal.3"
          accessibilityLabel={chips.length > 0 ? `Filters, ${chips.length} on` : 'Filters'}
          selected={chips.length > 0}
          onPress={openFilters}
        >
          {chips.length > 0 ? (
            <Stack.Toolbar.Badge>{String(chips.length)}</Stack.Toolbar.Badge>
          ) : null}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <ResultsList
        items={rows}
        searchKey={results.searchKey}
        updating={results.updating}
        onOpen={openRecipe}
        onEndReached={results.loadMore}
        loadingMore={results.loadingMore}
        header={<View style={styles.header}>{header}</View>}
        empty={empty === null ? null : <View>{empty}</View>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingBottom: space.xs },
  stack: { gap: space.xl },
  results: { gap: space.md },
  section: { gap: space.sm },
  // Chips and the top row run to the screen edges while scrolling sideways.
  bleed: { marginHorizontal: -gutter },
  topRow: { gap: space.md, paddingHorizontal: gutter },
});
