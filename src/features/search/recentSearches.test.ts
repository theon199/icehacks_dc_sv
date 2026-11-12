import { act, renderHook } from '@testing-library/react-native';

import {
  addRecentTerm,
  normalizeTerm,
  RECENT_SEARCH_LIMIT,
  removeRecentTerm,
  useRecentSearches,
  useRecentSearchesStore,
} from './recentSearches';

beforeEach(async () => {
  await act(async () => {
    useRecentSearchesStore.setState({ ownerId: null, terms: [] });
  });
});

describe('recent search terms', () => {
  it('tidies whitespace and ignores input too short to be a search', () => {
    expect(normalizeTerm('  dal   makhani ')).toBe('dal makhani');
    expect(normalizeTerm('a')).toBeNull();
    expect(normalizeTerm('!!')).toBeNull();
  });

  it('puts the newest first and moves repeats to the front', () => {
    let terms = addRecentTerm([], 'soup');
    terms = addRecentTerm(terms, 'tofu');
    terms = addRecentTerm(terms, 'Soup');
    expect(terms).toEqual(['Soup', 'tofu']);
  });

  it('keeps only the most recent few', () => {
    let terms: readonly string[] = [];
    for (let i = 0; i < RECENT_SEARCH_LIMIT + 3; i++) terms = addRecentTerm(terms, `dish ${i}`);
    expect(terms).toHaveLength(RECENT_SEARCH_LIMIT);
    expect(terms[0]).toBe(`dish ${RECENT_SEARCH_LIMIT + 2}`);
  });

  it('removes a term regardless of case', () => {
    expect(removeRecentTerm(['Soup', 'tofu'], 'soup')).toEqual(['tofu']);
  });
});

describe('recent searches store', () => {
  it('records, removes and clears terms for the signed-in person', async () => {
    const { result } = await renderHook(() => useRecentSearches('user-1'));
    await act(async () => {
      useRecentSearchesStore.getState().record('user-1', 'lentils');
    });
    await act(async () => {
      useRecentSearchesStore.getState().record('user-1', 'salmon');
    });
    expect(result.current).toEqual(['salmon', 'lentils']);

    await act(async () => {
      useRecentSearchesStore.getState().remove('user-1', 'salmon');
    });
    expect(result.current).toEqual(['lentils']);

    await act(async () => {
      useRecentSearchesStore.getState().clear();
    });
    expect(result.current).toEqual([]);
  });

  it('never shows one account’s terms to another', async () => {
    await act(async () => {
      useRecentSearchesStore.getState().record('user-1', 'lentils');
    });
    const { result } = await renderHook(() => useRecentSearches('user-2'));
    expect(result.current).toEqual([]);

    // The next person's first search replaces the previous list instead of joining it.
    await act(async () => {
      useRecentSearchesStore.getState().record('user-2', 'tofu');
    });
    expect(result.current).toEqual(['tofu']);
    expect(useRecentSearchesStore.getState().terms).toEqual(['tofu']);
  });

  it('shows nothing while signed out', async () => {
    await act(async () => {
      useRecentSearchesStore.getState().record('user-1', 'lentils');
    });
    const { result } = await renderHook(() => useRecentSearches(null));
    expect(result.current).toEqual([]);
  });
});
