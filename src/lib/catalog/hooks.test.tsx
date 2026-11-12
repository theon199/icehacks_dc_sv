import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import {
  catalogKeys,
  sameSafetyFilters,
  useCandidates,
  usePantryStaples,
  useRecipe,
  useRecipeFamily,
  useRecipes,
  useRecipeSearch,
} from './hooks';
import {
  getPantryStaples,
  getRecipeDetail,
  getRecipesByFamily,
  getRecipeSummaries,
  listCandidates,
  searchRecipes,
} from './queries';
import type { RecipeSummary, SearchFilters } from './types';
import { CatalogError } from '../db/catalog';

jest.mock('./queries', () => ({
  getPantryStaples: jest.fn(),
  getRecipeDetail: jest.fn(),
  getRecipesByFamily: jest.fn(),
  getRecipeSummaries: jest.fn(),
  listCandidates: jest.fn(),
  searchRecipes: jest.fn(),
}));

const summary = (id: string) => ({ id, title: id }) as unknown as RecipeSummary;

const clients: QueryClient[] = [];

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  clients.push(client);
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

afterEach(() => {
  onlineManager.setOnline(true);
  for (const client of clients.splice(0)) client.clear();
});

describe('catalog hooks', () => {
  it('loads a recipe and caches it forever', async () => {
    jest.mocked(getRecipeDetail).mockResolvedValue(summary('r1') as never);
    const { client, Wrapper } = wrapper();
    const { result } = await renderHook(() => useRecipe('r1'), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toMatchObject({ id: 'r1' }));
    expect(client.getQueryState(catalogKeys.recipe('r1'))?.isInvalidated).toBe(false);
    expect(
      client
        .getQueryCache()
        .find({ queryKey: catalogKeys.recipe('r1') })
        ?.isStale(),
    ).toBe(false);
  });

  it('stays idle without an id', async () => {
    const { Wrapper } = wrapper();
    const { result } = await renderHook(() => useRecipe(null), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(getRecipeDetail).not.toHaveBeenCalled();
  });

  it('runs while the device is offline, since the catalog is local', async () => {
    onlineManager.setOnline(false);
    jest.mocked(listCandidates).mockResolvedValue([]);
    const { Wrapper } = wrapper();
    const { result } = await renderHook(() => useCandidates({ limit: 10 }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('does not retry when the catalog is missing', async () => {
    jest.mocked(getRecipeSummaries).mockRejectedValue(new CatalogError('missing', 'no catalog'));
    const { Wrapper } = wrapper();
    const { result } = await renderHook(() => useRecipes(['a']), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(getRecipeSummaries).toHaveBeenCalledTimes(1);
  });

  it('pages search results with the returned cursor', async () => {
    jest
      .mocked(searchRecipes)
      .mockResolvedValueOnce({ items: [summary('a')], nextCursor: 30 })
      .mockResolvedValueOnce({ items: [summary('b')], nextCursor: null });
    const { Wrapper } = wrapper();
    const { result } = await renderHook(() => useRecipeSearch('dal', { course: 'main' }), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);
    await act(async () => {
      await result.current.fetchNextPage();
    });
    expect(searchRecipes).toHaveBeenLastCalledWith('dal', { course: 'main' }, 30);
    await waitFor(() =>
      expect(
        result.current.data?.pages.flatMap((page) => page.items.map((item) => item.id)),
      ).toEqual(['a', 'b']),
    );
    expect(result.current.hasNextPage).toBe(false);
  });

  describe('previous results while a new search loads', () => {
    // The second search stays in flight while the test looks at what is shown, and is settled
    // afterwards so nothing is left pending when the test ends.
    const inFlight: (() => void)[] = [];
    const held = () =>
      new Promise<{ items: RecipeSummary[]; nextCursor: null }>((resolve) => {
        inFlight.push(() => resolve({ items: [], nextCursor: null }));
      });

    afterEach(async () => {
      await act(async () => {
        for (const release of inFlight.splice(0)) release();
      });
    });

    async function searchAfterChange(next: { query: string; filters: SearchFilters }) {
      jest
        .mocked(searchRecipes)
        .mockResolvedValueOnce({ items: [summary('shown')], nextCursor: null })
        .mockImplementationOnce(held);
      const { Wrapper } = wrapper();
      const initial = {
        query: 'dal',
        filters: { avoidAllergens: ['peanut'], dietMask: 1 } as SearchFilters,
      };
      const hook = await renderHook(
        ({ query, filters }: { query: string; filters: SearchFilters }) =>
          useRecipeSearch(query, filters),
        { wrapper: Wrapper, initialProps: initial },
      );
      await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
      await hook.rerender(next);
      await waitFor(() => expect(searchRecipes).toHaveBeenCalledTimes(2));
      return hook.result;
    }

    it('keeps them when only the text or non-safety filters change', async () => {
      const result = await searchAfterChange({
        query: 'dal tadka',
        filters: { avoidAllergens: ['peanut'], dietMask: 1, maxMinutes: 30 },
      });
      expect(result.current.isPlaceholderData).toBe(true);
      expect(result.current.data?.pages[0]?.items.map((item) => item.id)).toEqual(['shown']);
    });

    it('drops them when an allergen is added', async () => {
      const result = await searchAfterChange({
        query: 'dal',
        filters: { avoidAllergens: ['peanut', 'milk'], dietMask: 1 },
      });
      expect(result.current.data).toBeUndefined();
      expect(result.current.isPending).toBe(true);
    });

    it('drops them when the diet changes', async () => {
      const result = await searchAfterChange({
        query: 'dal',
        filters: { avoidAllergens: ['peanut'], dietMask: 3 },
      });
      expect(result.current.data).toBeUndefined();
      expect(result.current.isPending).toBe(true);
    });
  });

  it('compares safety filters regardless of order, duplicates or an empty mask', () => {
    expect(
      sameSafetyFilters(
        { avoidAllergens: ['milk', 'peanut'], dietMask: 0 },
        { avoidAllergens: ['peanut', 'milk', 'milk'] },
      ),
    ).toBe(true);
    expect(sameSafetyFilters({ avoidAllergens: ['milk'] }, {})).toBe(false);
    expect(sameSafetyFilters({ dietMask: 2 }, { dietMask: 4 })).toBe(false);
  });

  it('reads a dish family only once its id is known, with its safety filters', async () => {
    jest.mocked(getRecipesByFamily).mockResolvedValue([summary('a'), summary('b')]);
    const { Wrapper } = wrapper();
    const idle = await renderHook(() => useRecipeFamily(null, {}), { wrapper: Wrapper });
    expect(idle.result.current.fetchStatus).toBe('idle');
    expect(getRecipesByFamily).not.toHaveBeenCalled();

    const filters = { avoidAllergens: ['peanut' as const] };
    const { result } = await renderHook(() => useRecipeFamily('fam:x', filters), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(getRecipesByFamily).toHaveBeenCalledWith('fam:x', filters);
  });

  it('keys families by normalised safety filters', () => {
    expect(
      catalogKeys.family('fam:x', { avoidAllergens: ['milk', 'egg', 'milk'], dietMask: 0 }),
    ).toEqual(catalogKeys.family('fam:x', { avoidAllergens: ['egg', 'milk'] }));
    expect(catalogKeys.family('fam:x', { avoidAllergens: ['milk'] })).not.toEqual(
      catalogKeys.family('fam:x', {}),
    );
  });

  it('loads pantry staples', async () => {
    jest.mocked(getPantryStaples).mockResolvedValue([]);
    const { Wrapper } = wrapper();
    const { result } = await renderHook(() => usePantryStaples(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getPantryStaples).toHaveBeenCalledTimes(1);
  });

  it('normalises search keys', () => {
    expect(catalogKeys.search('  Chicken  CURRY ', {})).toEqual(
      catalogKeys.search('chicken curry', {}),
    );
  });
});
