/**
 * What the person is searching for right now. Shared by the Search screen and the filter sheet
 * (a separate route), and kept for the session so switching to Chef and back loses nothing.
 */
import { create } from 'zustand';

import { EMPTY_FILTERS, type SearchFilterState } from './filters';

export type SearchMode = 'search' | 'chef';

interface SearchState {
  mode: SearchMode;
  query: string;
  filters: SearchFilterState;
  setMode: (mode: SearchMode) => void;
  setQuery: (query: string) => void;
  setFilters: (filters: SearchFilterState) => void;
  updateFilters: (update: (filters: SearchFilterState) => SearchFilterState) => void;
  resetFilters: () => void;
  reset: () => void;
}

export const useSearchStore = create<SearchState>()((set, get) => ({
  mode: 'search',
  query: '',
  filters: EMPTY_FILTERS,
  setMode: (mode) => set({ mode }),
  setQuery: (query) => set({ query }),
  setFilters: (filters) => set({ filters }),
  updateFilters: (update) => set({ filters: update(get().filters) }),
  resetFilters: () => set({ filters: EMPTY_FILTERS }),
  reset: () => set({ mode: 'search', query: '', filters: EMPTY_FILTERS }),
}));
