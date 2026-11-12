import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { cuisineLabel, DIET_LABELS } from '@/domain/types';
import { tokenize } from '@/lib/catalog';
import { EmptyState, ErrorState } from '@/ui';
import { gutter, space } from '@/ui/tokens';

import { FilterBar } from './FilterBar';
import { IdlePanel } from './IdlePanel';
import { NoResults } from './NoResults';
import { ResultsGrid } from './ResultsGrid';
import { ResultsSkeleton } from './ResultsSkeleton';
import { SafetyNotice } from './SafetyNotice';
import { SearchField } from './SearchField';
import { useAiAccess, useLovedCuisines, useSearchOwnerId } from '../deps';
import { activeFilterChips, toggleValue, type ActiveFilterChip } from '../filters';
import { useRecentSearches, useRecentSearchesStore } from '../recentSearches';
import type { SearchResultItem } from '../resultItems';
import { useSearchStore } from '../searchStore';
import { useSearchResults } from '../useSearchResults';

/** The Search segment: box, filters, and the results grid with its idle and empty states. */
export function SearchPane() {
  const router = useRouter();
  const query = useSearchStore((state) => state.query);
  const filters = useSearchStore((state) => state.filters);
  const setQuery = useSearchStore((state) => state.setQuery);
  const setMode = useSearchStore((state) => state.setMode);
  const setFilters = useSearchStore((state) => state.setFilters);
  const resetFilters = useSearchStore((state) => state.resetFilters);
  const results = useSearchResults();

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

  const runSearch = useCallback(
    (term: string) => {
      setQuery(term);
      remember(term);
    },
    [setQuery, remember],
  );

  const openRecipe = useCallback(
    (item: SearchResultItem) => {
      remember(useSearchStore.getState().query);
      router.push({ pathname: '/recipe/[id]', params: { id: item.recipe.id } });
    },
    [remember, router],
  );

  const chips = useMemo(
    () => activeFilterChips(filters, cuisineLabel, (diet) => DIET_LABELS[diet]),
    [filters],
  );

  const header = results.active ? (
    results.safetyAnswered ? null : (
      <SafetyNotice onSetUp={() => router.push('/preferences')} />
    )
  ) : (
    <View style={styles.idle}>
      {results.safetyAnswered ? null : <SafetyNotice onSetUp={() => router.push('/preferences')} />}
      <IdlePanel
        recentTerms={recentTerms}
        lovedCuisines={lovedCuisines}
        onSearch={runSearch}
        onRemoveRecent={(term) => {
          if (ownerId) removeRecent(ownerId, term);
        }}
        onClearRecents={clearRecents}
        onPickCuisine={(cuisine) =>
          setFilters({ ...filters, cuisines: toggleValue(filters.cuisines, cuisine) })
        }
      />
    </View>
  );

  let empty;
  if (results.loading) empty = <ResultsSkeleton />;
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
      <View style={styles.controls}>
        <View style={styles.field}>
          <SearchField value={query} onChangeText={setQuery} onSubmit={() => remember(query)} />
        </View>
        <FilterBar
          chips={chips}
          onOpenFilters={() => router.push('/search/filters')}
          onRemove={(chip: ActiveFilterChip) => setFilters(chip.remove(filters))}
          onClearAll={resetFilters}
        />
      </View>
      <ResultsGrid
        items={results.items}
        onOpen={openRecipe}
        onEndReached={results.loadMore}
        loadingMore={results.loadingMore}
        header={header}
        empty={empty}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  controls: { gap: space.sm, paddingBottom: space.sm },
  field: { paddingHorizontal: gutter },
  idle: { gap: space.lg },
});
