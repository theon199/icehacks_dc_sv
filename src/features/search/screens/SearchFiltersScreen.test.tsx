import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, screen, userEvent } from '@testing-library/react-native';

import { getCuisines } from '@/lib/catalog/queries';
import { renderWithTheme } from '@/test/render';

import { SearchFiltersScreen } from './SearchFiltersScreen';
import { EMPTY_FILTERS, toSearchFilters } from '../filters';
import { useSearchStore } from '../searchStore';

jest.mock('@/lib/catalog/queries', () => ({
  ...jest.requireActual('@/lib/catalog/queries'),
  getCuisines: jest.fn(),
}));

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, canGoBack: () => true }),
}));

async function renderSheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await renderWithTheme(
    <QueryClientProvider client={client}>
      <SearchFiltersScreen />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  jest.mocked(getCuisines).mockResolvedValue([
    { cuisine: 'thai', region: 'southeast_asia', recipeCount: 12 },
    { cuisine: 'indian', region: 'south_asia', recipeCount: 30 },
  ]);
  await act(async () => {
    useSearchStore.getState().reset();
  });
});

describe('SearchFiltersScreen', () => {
  it('turns picked chips into the matching query arguments', async () => {
    await renderSheet();
    const user = userEvent.setup();
    await user.press(await screen.findByRole('checkbox', { name: 'Thai' }));
    await user.press(screen.getByRole('checkbox', { name: 'Soup' }));
    await user.press(screen.getByRole('radio', { name: '30 min or less' }));
    await user.press(screen.getByRole('checkbox', { name: 'Vegetarian' }));
    await user.press(screen.getByRole('checkbox', { name: 'High fiber' }));
    await user.press(screen.getByRole('radio', { name: '450 kcal or less' }));

    expect(toSearchFilters(useSearchStore.getState().filters)).toEqual({
      cuisines: ['thai'],
      course: 'soup',
      maxMinutes: 30,
      dietMask: 1,
      goals: ['high_fiber'],
      maxKcal: 450,
    });
  });

  it('switches a single-choice limit off when tapped again', async () => {
    await renderSheet();
    const user = userEvent.setup();
    await user.press(screen.getByRole('radio', { name: '15 min or less' }));
    expect(useSearchStore.getState().filters.maxMinutes).toBe(15);
    await user.press(screen.getByRole('radio', { name: '15 min or less' }));
    expect(useSearchStore.getState().filters.maxMinutes).toBeNull();
  });

  it('resets everything and closes', async () => {
    await act(async () => {
      useSearchStore.getState().setFilters({ ...EMPTY_FILTERS, diets: ['vegan'] });
    });
    await renderSheet();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Reset' }));
    expect(useSearchStore.getState().filters).toEqual(EMPTY_FILTERS);
    await user.press(screen.getByRole('button', { name: 'Done' }));
    expect(mockBack).toHaveBeenCalled();
  });
});
