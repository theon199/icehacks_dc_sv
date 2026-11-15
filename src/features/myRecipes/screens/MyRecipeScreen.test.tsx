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
    usePreferencesStore.setState({
      prefs: { ...defaultPreferences, allergensAnswered: true, allergens: [], diets: [] },
    });
    const user = userEvent.setup();
    await renderWithTheme(<MyRecipeScreen id="ube" />, { wrapper });
    expect(await screen.findByText('1 ingredient to confirm')).toBeOnTheScreen();
    await user.press(screen.getByTestId('safety-confirm-single'));
    expect(await screen.findByText('Fits your allergies and diet')).toBeOnTheScreen();
    const saved = useMyRecipesStore.getState().recipes.ube;
    expect(saved?.safety).toMatchObject({ status: 'clear', allergens: [] });
    expect(saved?.confirmations).toEqual([expect.objectContaining({ allergens: [], diets: [] })]);

    await user.press(screen.getByTestId('ingredient-0-undo'));
    expect(await screen.findByText('1 ingredient to confirm')).toBeOnTheScreen();
    expect(useMyRecipesStore.getState().recipes.ube?.safety.status).toBe('needs_check');
  });

  it('offers no check for a line that may hold a declared allergen', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<MyRecipeScreen id="ube" />, { wrapper });
    await user.press(screen.getByTestId('own-recipe-warning-continue'));
    expect(await screen.findByText("1 ingredient Famara can't check")).toBeOnTheScreen();
    expect(screen.queryByTestId('safety-confirm-single')).toBeNull();
    expect(screen.queryByText('I checked this')).toBeNull();
    expect(useMyRecipesStore.getState().recipes.ube?.safety.status).toBe('needs_check');
  });

  describe('warning before use for someone with a declared allergen', () => {
    it('shows the warning first, then the recipe once they continue', async () => {
      const user = userEvent.setup();
      await renderWithTheme(<MyRecipeScreen id="ube" />, { wrapper });
      expect(screen.getByText('Check the labels first')).toBeOnTheScreen();
      expect(
        screen.getByText(/checked each line against your allergies \(milk\)/),
      ).toBeOnTheScreen();
      expect(screen.queryByTestId('recipe-safety')).toBeNull();
      await user.press(screen.getByTestId('own-recipe-warning-continue'));
      expect(await screen.findByTestId('recipe-safety')).toBeOnTheScreen();
      expect(screen.queryByText('Check the labels first')).toBeNull();
    });

    it('goes back without opening the recipe', async () => {
      const user = userEvent.setup();
      await renderWithTheme(<MyRecipeScreen id="ube" />, { wrapper });
      await user.press(screen.getByTestId('own-recipe-warning-back'));
      expect(mockRouter.back).toHaveBeenCalled();
      expect(screen.queryByTestId('recipe-safety')).toBeNull();
    });

    it('shows no warning to someone without declared allergens', async () => {
      usePreferencesStore.setState({
        prefs: { ...defaultPreferences, allergensAnswered: true, allergens: [], diets: [] },
      });
      await renderWithTheme(<MyRecipeScreen id="ube" />, { wrapper });
      expect(screen.queryByText('Check the labels first')).toBeNull();
      expect(await screen.findByTestId('recipe-safety')).toBeOnTheScreen();
    });

    it('shows the warning again each time the recipe is opened', async () => {
      const user = userEvent.setup();
      const first = await renderWithTheme(<MyRecipeScreen id="ube" />, { wrapper });
      await user.press(screen.getByTestId('own-recipe-warning-continue'));
      await first.unmount();
      await renderWithTheme(<MyRecipeScreen id="ube" />, { wrapper });
      expect(screen.getByText('Check the labels first')).toBeOnTheScreen();
    });
  });

  it('says plainly when the ingredients could not be checked', async () => {
    usePreferencesStore.setState({
      prefs: { ...defaultPreferences, allergensAnswered: true, allergens: [], diets: [] },
    });
    jest.mocked(getIngredients).mockRejectedValue(new Error('offline'));
    await renderWithTheme(<MyRecipeScreen id="ube" />, { wrapper });
    expect(
      // The catalog read is retried once before it counts as failed.
      await screen.findByText(
        "Couldn't load the ingredient data to check this recipe.",
        {},
        { timeout: 5000 },
      ),
    ).toBeOnTheScreen();
  });

  it('says when the recipe no longer exists', async () => {
    await renderWithTheme(<MyRecipeScreen id="gone" />, { wrapper });
    expect(screen.getByText('Recipe not found')).toBeOnTheScreen();
  });
});
