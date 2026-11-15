import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { clearCatalogCaches, type RecipeCandidate } from '@/lib/catalog';
import { listCandidates } from '@/lib/catalog/queries';
import { usePantryStore } from '@/stores/pantry';
import { defaultPreferences, usePreferencesStore } from '@/stores/preferences';
import { useSettingsStore } from '@/stores/settings';

import { candidate } from './test/fixtures';
import { useFridgeMeals } from './useFridgeMeals';

jest.mock('@/lib/catalog/queries', () => ({
  ...jest.requireActual<Record<string, unknown>>('@/lib/catalog/queries'),
  listCandidates: jest.fn(),
  getIngredients: jest.fn(() => Promise.resolve([])),
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => (jest.requireActual('crypto') as { randomUUID: () => string }).randomUUID(),
}));

const at = '2026-11-14T18:00:00.000Z';
let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function answer(allergens: (typeof defaultPreferences)['allergens'] = []) {
  usePreferencesStore.setState({
    prefs: { ...defaultPreferences, allergens, allergensAnswered: true, onboardedAt: at },
  });
}

function stock(...ids: string[]) {
  usePantryStore.getState().addMany(
    ids.map((id) => ({ ingredientId: id, name: id, category: 'other' as const })),
    at,
  );
}

const ids = (list: readonly { recipe: { id: string } }[]) => list.map((pick) => pick.recipe.id);

beforeEach(() => {
  clearCatalogCaches();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  usePantryStore.getState().reset();
  usePreferencesStore.setState({ prefs: defaultPreferences });
  useSettingsStore.getState().reset();
  jest.mocked(listCandidates).mockReset();
});

afterEach(() => client.clear());

describe('useFridgeMeals', () => {
  it('asks for the pantry first, then for the safety answers, without reading the catalog', async () => {
    const { result, rerender } = await renderHook(useFridgeMeals, { wrapper });
    expect(result.current.status).toBe('emptyPantry');
    await act(async () => stock('paneer'));
    await rerender({});
    expect(result.current.status).toBe('needsPreferences');
    expect(listCandidates).not.toHaveBeenCalled();
  });

  it('ranks every meal from one safe catalog read', async () => {
    answer(['milk']);
    stock('egg', 'tomato', 'paneer', 'pea');
    jest
      .mocked(listCandidates)
      .mockResolvedValue([
        candidate('t:eggs', { course: 'breakfast', coreIngredientIds: ['egg', 'tomato'] }),
        candidate('t:matar', { coreIngredientIds: ['paneer', 'pea', 'tomato'] }),
        candidate('t:salad', { course: 'salad', coreIngredientIds: ['tomato', 'egg'] }),
        candidate('t:unverified', { coreIngredientIds: ['egg'], allergens: { milk: 'unknown' } }),
      ]);
    const { result } = await renderHook(useFridgeMeals, { wrapper });
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(listCandidates).toHaveBeenCalledTimes(1);
    expect(listCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        avoidAllergens: ['milk'],
        course: ['breakfast', 'main', 'soup', 'salad'],
      }),
    );
    const { picks } = result.current;
    expect(ids(picks.breakfast)).toEqual(['t:eggs']);
    expect(ids(picks.lunch).sort()).toEqual(['t:matar', 't:salad']);
    // Unknown allergen status for a declared allergen is never shown (fail-closed).
    expect(ids(picks.dinner)).toEqual(['t:matar']);
  });

  it('reports a failed catalog read and retries it', async () => {
    answer();
    stock('egg');
    // The catalog hook retries a failed read once before reporting it.
    jest.mocked(listCandidates).mockRejectedValue(new Error('db closed'));
    const { result } = await renderHook(useFridgeMeals, { wrapper });
    await waitFor(() => expect(result.current.status).toBe('error'), { timeout: 5000 });
    expect(result.current.picks.dinner).toEqual([]);

    jest
      .mocked(listCandidates)
      .mockResolvedValue([candidate('t:omelette', { coreIngredientIds: ['egg'] })]);
    await act(async () => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(ids(result.current.picks.dinner)).toEqual(['t:omelette']);
  });

  it('never shows picks ranked under old allergen answers', async () => {
    answer();
    stock('egg');
    jest
      .mocked(listCandidates)
      .mockResolvedValue([candidate('t:omelette', { coreIngredientIds: ['egg'] })]);
    const { result } = await renderHook(useFridgeMeals, { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // The read under the new answer is held open while the old picks would still be on hand.
    let release: (value: RecipeCandidate[]) => void = () => undefined;
    jest.mocked(listCandidates).mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    await act(async () => answer(['egg']));
    expect(result.current.status).toBe('loading');
    expect(result.current.picks.dinner).toEqual([]);

    await act(async () => release([]));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.picks.dinner).toEqual([]);
  });
});
