import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { catalogKeys, useCandidates, useRecipe, useRecipes, useRecipeSearch } from './hooks';
import { getRecipeDetail, getRecipeSummaries, listCandidates, searchRecipes } from './queries';
import type { RecipeSummary } from './types';
import { CatalogError } from '../db/catalog';

jest.mock('./queries', () => ({
  getRecipeDetail: jest.fn(),
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

  it('normalises search keys', () => {
    expect(catalogKeys.search('  Chicken  CURRY ', {})).toEqual(
      catalogKeys.search('chicken curry', {}),
    );
  });
});
