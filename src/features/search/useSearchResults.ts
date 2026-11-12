/**
 * Ties the search box and filters to the catalog: debounces typing, turns filters into query
 * arguments, pages through results and annotates each one with the person's safety verdict.
 */
import { useMemo } from 'react';

import { tokenize, useRecipeSearch } from '@/lib/catalog';

import { useSafetyRules } from './deps';
import { hasActiveFilters, toSearchFilters } from './filters';
import { resultItemCache, toResultItems, type SearchResultItem } from './resultItems';
import { useSearchStore } from './searchStore';
import { useDebouncedValue } from './useDebouncedValue';

/** Typed text with outer spaces trimmed and inner runs of spaces collapsed, for display. */
export function tidyQuery(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * What the catalog actually searches for: its word tokens. Text that differs only in case, spacing
 * or punctuation ("Pho ", "pho!") finds the same recipes, so it shares one query and one
 * `searchKey`, and the grid neither refetches nor jumps back to the top.
 */
export function searchTextOf(text: string): string {
  return tokenize(text).join(' ');
}

export interface SearchResults {
  /** The text the current results are for (the debounced query, tidied). */
  settledQuery: string;
  /** True when the box has searchable words or a filter is on; false shows the idle panel. */
  active: boolean;
  hasFilters: boolean;
  items: SearchResultItem[];
  /** Whether the person has answered the safety questions; badges cover everything until then. */
  safetyAnswered: boolean;
  /**
   * Identifies the search the results belong to (text plus filters). Changes when the person asks
   * for something new, never when another page of the same search loads.
   */
  searchKey: string;
  /** First page not loaded yet (nothing to show). */
  loading: boolean;
  /** The previous search's results are on screen while the current one loads. */
  updating: boolean;
  error: unknown;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  retry: () => void;
}

export function useSearchResults(): SearchResults {
  const query = useSearchStore((state) => state.query);
  const filters = useSearchStore((state) => state.filters);
  const settledQuery = tidyQuery(useDebouncedValue(query));
  const searchText = searchTextOf(settledQuery);
  const args = useMemo(() => toSearchFilters(filters), [filters]);
  const search = useRecipeSearch(searchText, args);
  const rules = useSafetyRules();
  const pages = search.data?.pages;
  const itemFor = useMemo(() => resultItemCache(rules), [rules]);
  const items = useMemo(() => toResultItems(pages, itemFor), [pages, itemFor]);
  const searchKey = useMemo(() => JSON.stringify([searchText, args]), [searchText, args]);

  const hasFilters = hasActiveFilters(filters);
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage, refetch } = search;
  return {
    settledQuery,
    active: searchText.length > 0 || hasFilters,
    hasFilters,
    items,
    safetyAnswered: rules.answered,
    searchKey,
    loading: search.isPending,
    updating: search.isPlaceholderData,
    error: search.isError ? search.error : null,
    hasMore: hasNextPage,
    loadingMore: isFetchingNextPage,
    loadMore: () => {
      if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
    },
    // A failed next page is retried on its own; anything else reloads the search.
    retry: () => void (isFetchNextPageError ? fetchNextPage() : refetch()),
  };
}
