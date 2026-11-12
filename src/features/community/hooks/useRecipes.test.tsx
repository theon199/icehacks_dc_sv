import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ALLERGEN_IDS, type AllergenId, type AllergenStatus } from '@/domain';
import type { RecipeSummary } from '@/lib/catalog';
import { usePreferencesStore } from '@/stores';

import { useWeeklyTopDishes } from './useRecipes';
import { fetchWeeklyTopDishes } from '../api/communityApi';
import { getRecipeSummaries } from '../deps';
import { createTestClient } from '../testing/renderWithClient';

jest.mock('../api/communityApi', () => ({ fetchWeeklyTopDishes: jest.fn() }));
jest.mock('../deps', () => ({ getRecipeSummaries: jest.fn() }));

function dish(id: string, statuses: Partial<Record<AllergenId, AllergenStatus>> = {}) {
  const allergens = Object.fromEntries(
    ALLERGEN_IDS.map((allergen) => [allergen, statuses[allergen] ?? 'free']),
  ) as Record<AllergenId, AllergenStatus>;
  return { id, title: `Dish ${id}`, allergens, dietFlags: 0 } as unknown as RecipeSummary;
}

const DISHES = [dish('peanut-stew', { peanut: 'contains' }), dish('maybe', { peanut: 'unknown' })];
const SAFE = dish('lentil-soup');

let client = createTestClient();
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = createTestClient();
  usePreferencesStore.getState().reset();
  jest.mocked(fetchWeeklyTopDishes).mockResolvedValue(
    [...DISHES, SAFE].map((d, i) => ({
      recipe_ref: d.id,
      cook_count: 10 - i,
      cooks: 10 - i,
      avg_rating: null,
      post_count: 1,
    })),
  );
  jest
    .mocked(getRecipeSummaries)
    .mockImplementation(async (ids) => [...DISHES, SAFE].filter((d) => ids.includes(d.id)));
});

afterEach(() => client.clear());

describe('useWeeklyTopDishes', () => {
  it('shows nothing, and asks the server for nothing, until allergens are answered', async () => {
    const { result } = await renderHook(() => useWeeklyTopDishes(), { wrapper });
    expect(result.current).toEqual([]);
    expect(fetchWeeklyTopDishes).not.toHaveBeenCalled();
  });

  it('leaves out dishes that contain, or may contain, a declared allergen', async () => {
    usePreferencesStore.getState().setAllergens(['peanut']);
    const { result } = await renderHook(() => useWeeklyTopDishes(), { wrapper });
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]?.recipe.id).toBe('lentil-soup');
  });

  it('shows every dish to someone who declared no allergens', async () => {
    usePreferencesStore.getState().setAllergens([]);
    const { result } = await renderHook(() => useWeeklyTopDishes(), { wrapper });
    await waitFor(() => expect(result.current).toHaveLength(3));
    expect(result.current.map((d) => d.cooks)).toEqual([10, 9, 8]);
  });
});
