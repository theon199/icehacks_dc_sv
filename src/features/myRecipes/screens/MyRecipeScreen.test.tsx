import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, userEvent } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { getIngredients } from '@/lib/catalog/queries';
import {
  defaultPreferences,
  useMyRecipesStore,
  usePantryStore,
  usePreferencesStore,
} from '@/stores';
import { renderWithTheme } from '@/test/render';

import { MyRecipeScreen } from './MyRecipeScreen';
import { catalogIngredient, savedRecipe } from '../testing';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@/lib/catalog/queries', () => ({ getIngredients: jest.fn() }));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const UBE = savedRecipe('ube', {
  title: 'Ube halaya',
  ingredients: [
    { text: '2 lb purple yam', name: 'ube', catalogIngredientId: null },
    { text: '4 cups cooked rice', name: 'rice', catalogIngredientId: 'rice' },
  ],
  safety: { status: 'needs_check', allergens: ['milk'], diets: [], checkedAt: 'x' },
});

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  usePreferencesStore.setState({
    prefs: { ...defaultPreferences, allergensAnswered: true, allergens: ['milk'], diets: [] },
  });
  usePantryStore.setState({ items: {} });
  useMyRecipesStore.setState({ recipes: { ube: UBE } });
  jest.mocked(getIngredients).mockResolvedValue([catalogIngredient('rice')]);
});

afterEach(() => client.clear());

describe('MyRecipeScreen', () => {
  it('re-checks the saved recipe and stores a confirmation with the new result', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<MyRecipeScreen id="ube" />, { wrapper });
    expect(await screen.findByText('1 ingredient to confirm')).toBeOnTheScreen();
    await user.press(screen.getByTestId('safety-confirm-single'));
    expect(await screen.findByText('Fits your allergies and diet')).toBeOnTheScreen();
    const saved = useMyRecipesStore.getState().recipes.ube;
    expect(saved?.safety).toMatchObject({ status: 'clear', allergens: ['milk'] });
    expect(saved?.confirmations).toEqual([
      expect.objectContaining({ allergens: ['milk'], diets: [] }),
    ]);

    await user.press(screen.getByTestId('ingredient-0-undo'));
    expect(await screen.findByText('1 ingredient to confirm')).toBeOnTheScreen();
    expect(useMyRecipesStore.getState().recipes.ube?.safety.status).toBe('needs_check');
  });

  it('says when the recipe no longer exists', async () => {
    await renderWithTheme(<MyRecipeScreen id="gone" />, { wrapper });
    expect(screen.getByText('Recipe not found')).toBeOnTheScreen();
  });
});
