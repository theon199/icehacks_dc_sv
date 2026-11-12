import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { dietMask } from '@/lib/catalog';
import { listCandidates } from '@/lib/catalog/queries';
import { defaultPreferences, useSettingsStore } from '@/stores';

import { candidateFilters, usePlanningCandidates } from './usePlanningCandidates';
import { candidatePool } from '../__fixtures__/recipes';
import { resetCookbookStores } from '../__fixtures__/render';
import type * as Deps from '../deps';
import { toDomainPreferences } from '../deps';

jest.mock('@/lib/catalog/queries', () => ({ listCandidates: jest.fn() }));
jest.mock('../deps', () => {
  const actual = jest.requireActual<typeof Deps>('../deps');
  return { ...actual, toDomainPreferences: jest.fn(actual.toDomainPreferences) };
});

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  resetCookbookStores();
  useSettingsStore.getState().reset();
  jest.mocked(listCandidates).mockResolvedValue(candidatePool());
});
afterEach(() => client.clear());

describe('usePlanningCandidates', () => {
  it('ranks with the units the person chose in settings', async () => {
    useSettingsStore.getState().setUnits('metric');
    const { result } = await renderHook(() => usePlanningCandidates(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(toDomainPreferences).toHaveBeenCalledWith(expect.anything(), 'metric');
  });

  it('asks the catalog for recipes meeting every followed diet', () => {
    const filters = candidateFilters({
      ...defaultPreferences,
      allergensAnswered: true,
      diets: ['vegetarian'],
    });
    expect(filters.dietMask).toBe(dietMask(['vegetarian']));
    expect(filters).not.toHaveProperty('excludeDietMask');
  });
});
