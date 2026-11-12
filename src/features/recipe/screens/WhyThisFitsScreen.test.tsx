import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { getIngredients, getRecipeDetail, getRecipeSummaries } from '@/lib/catalog';
import { useFeedbackStore, usePantryStore, usePreferencesStore } from '@/stores';
import { renderWithTheme } from '@/test/render';

import { WhyThisFitsScreen } from './WhyThisFitsScreen';
import { allergenMap, ingredient, makeDetail, prefs } from '../test/fixtures';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/catalog/queries', () => ({
  getRecipeDetail: jest.fn(),
  getRecipeSummaries: jest.fn(),
  getIngredients: jest.fn(),
  getSubstitutions: jest.fn(),
  listCandidates: jest.fn(),
  searchRecipes: jest.fn(),
  searchIngredients: jest.fn(),
  getCuisines: jest.fn(),
  getCatalogMeta: jest.fn(),
}));

let client: QueryClient;

function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  jest.mocked(getRecipeSummaries).mockResolvedValue([]);
  jest.mocked(getIngredients).mockImplementation(async (ids) => ids.map((id) => ingredient(id)));
  usePantryStore.getState().reset();
  useFeedbackStore.getState().reset();
});

afterEach(() => client.clear());

describe('WhyThisFitsScreen', () => {
  it('explains each factor of the fit score in plain words', async () => {
    jest.mocked(getRecipeDetail).mockResolvedValue(makeDetail());
    usePreferencesStore.setState({
      prefs: prefs({ cuisines: ['indian'], goals: ['more_fiber'], maxMinutes: 45 }),
    });
    await renderWithTheme(
      <Providers>
        <WhyThisFitsScreen recipeId="test:1" />
      </Providers>,
    );
    expect(await screen.findByText('You love Indian food.')).toBeTruthy();
    expect(screen.getByText('Fits every goal you chose: more fiber.')).toBeTruthy();
    expect(screen.getByText('Ready in 30 minutes, within your 45 minutes.')).toBeTruthy();
    expect(screen.getByText('Your pantry')).toBeTruthy();
  });

  it('warns when the recipe is not safe to assume for the person', async () => {
    jest
      .mocked(getRecipeDetail)
      .mockResolvedValue(makeDetail({ allergens: allergenMap({ peanut: 'contains' }) }));
    usePreferencesStore.setState({ prefs: prefs({ allergens: ['peanut'] }) });
    await renderWithTheme(
      <Providers>
        <WhyThisFitsScreen recipeId="test:1" />
      </Providers>,
    );
    expect(await screen.findByText('Not safe to assume for you')).toBeTruthy();
    expect(screen.getByText('Contains peanuts')).toBeTruthy();
  });
});
