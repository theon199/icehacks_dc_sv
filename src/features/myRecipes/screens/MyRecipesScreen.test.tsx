import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useSessionStore } from '@/features/auth';
import { getIngredients } from '@/lib/catalog/queries';
import {
  defaultPreferences,
  useMyRecipesStore,
  usePantryStore,
  usePreferencesStore,
} from '@/stores';
import { renderWithTheme } from '@/test/render';

import { MyRecipesScreen } from './MyRecipesScreen';
import { useMyRecipesForMeal } from '../hooks/useMyRecipesForMeal';
import type * as TestingModule from '../testing';
import { catalogIngredient, MEAT_DIETS, pantryItem, savedRecipe } from '../testing';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
};
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual<typeof TestingModule>('../testing').MockFlashList,
}));
jest.mock('@/lib/catalog/queries', () => ({ getIngredients: jest.fn() }));

const CATALOG = [
  catalogIngredient('rice'),
  catalogIngredient('garlic'),
  catalogIngredient('bay_leaf', { name: 'bay leaf', plural: 'bay leaves' }),
  catalogIngredient('chicken_thigh', { name: 'chicken thigh', dietFlags: MEAT_DIETS }),
  catalogIngredient('peanut_butter', { name: 'peanut butter', allergens: ['peanut'] }),
];

const RECIPES = [
  savedRecipe('ready', { title: 'Garlic fried rice' }),
  savedRecipe('missing', {
    title: 'Chicken adobo',
    meal: 'dinner',
    ingredients: [
      { text: '2 lb chicken thighs', name: 'chicken thighs', catalogIngredientId: 'chicken_thigh' },
      { text: '3 bay leaves', name: 'bay leaves', catalogIngredientId: 'bay_leaf' },
    ],
  }),
  savedRecipe('unknown', {
    title: 'Lola’s ube halaya',
    ingredients: [{ text: '2 lb purple yam', name: 'ube', catalogIngredientId: null }],
  }),
  savedRecipe('conflict', {
    title: 'Peanut toast',
    ingredients: [
      { text: '2 tbsp peanut butter', name: 'peanut butter', catalogIngredientId: 'peanut_butter' },
    ],
  }),
];

const thisYear = new Date().getFullYear();
const initialSession = useSessionStore.getState();
let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useSessionStore.setState(initialSession, true);
  useSessionStore.getState().signedIn({
    userId: 'person-1',
    birthYear: thisYear - 35,
    onboardingComplete: true,
    aiConsent: true,
  });
  usePreferencesStore.setState({
    prefs: { ...defaultPreferences, allergensAnswered: true, allergens: ['peanut'], diets: [] },
  });
  usePantryStore.setState({
    items: {
      a: pantryItem('rice', 'rice'),
      b: pantryItem('garlic', 'garlic'),
      c: pantryItem('chicken_thigh', 'chicken thighs'),
    },
  });
  useMyRecipesStore.setState({
    recipes: Object.fromEntries(RECIPES.map((recipe) => [recipe.id, recipe])),
  });
  jest.mocked(getIngredients).mockResolvedValue(CATALOG);
});

afterEach(() => client.clear());

describe('MyRecipesScreen', () => {
  it('sorts recipes into ready, missing a few things and needs a check', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<MyRecipesScreen />, { wrapper });
    expect(await screen.findByText('Ready now')).toBeOnTheScreen();
    expect(screen.getByText('Missing a few things')).toBeOnTheScreen();
    expect(screen.getByText('Needs a check')).toBeOnTheScreen();
    expect(screen.getByText('You have all 2')).toBeOnTheScreen();
    expect(screen.getByText('Need bay leaves')).toBeOnTheScreen();
    expect(screen.getByText("1 can't be checked")).toBeOnTheScreen();
    expect(screen.getByText('Contains peanuts')).toBeOnTheScreen();

    await user.press(screen.getByTestId('my-recipes-add'));
    expect(mockRouter.push).toHaveBeenCalledWith('/my-recipes/add');
    await user.press(screen.getByTestId('my-recipe-missing'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/my-recipes/[id]',
      params: { id: 'missing' },
    });
  });

  it('offers turning AI on instead of adding when AI is off', async () => {
    useSessionStore.getState().signedIn({
      userId: 'person-1',
      birthYear: thisYear - 35,
      onboardingComplete: true,
      aiConsent: false,
    });
    await renderWithTheme(<MyRecipesScreen />, { wrapper });
    expect(await screen.findByText('Adding recipes uses AI')).toBeOnTheScreen();
    expect(screen.queryByTestId('my-recipes-add')).toBeNull();
  });

  it('keeps every recipe under needs a check when the catalog cannot be read', async () => {
    jest.mocked(getIngredients).mockRejectedValue(new Error('catalog unavailable'));
    await renderWithTheme(<MyRecipesScreen />, { wrapper });
    // The catalog read is retried once before it counts as failed.
    expect(
      await screen.findByText("Couldn't check ingredients", {}, { timeout: 5000 }),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Ready now')).toBeNull();
    expect(screen.getByText('Needs a check')).toBeOnTheScreen();
  });
});

describe('useMyRecipesForMeal', () => {
  it('returns only cleared recipes for the meal, with pantry coverage', async () => {
    const { result } = await renderHook(() => useMyRecipesForMeal('breakfast'), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.recipes.map((entry) => entry.recipe.id)).toEqual(['ready']);
    expect(result.current.recipes[0]?.coverage).toMatchObject({ ready: true, have: 2, total: 2 });
  });

  it('suggests nothing until the safety check can run', async () => {
    let release: (value: typeof CATALOG) => void = () => {};
    jest.mocked(getIngredients).mockReturnValue(new Promise((resolve) => (release = resolve)));
    const { result } = await renderHook(() => useMyRecipesForMeal('breakfast'), { wrapper });
    expect(result.current).toEqual({ recipes: [], status: 'loading' });
    await act(async () => release(CATALOG));
    await waitFor(() => expect(result.current.recipes).toHaveLength(1));
  });

  it('drops a recipe once the person declares an allergen it contains', async () => {
    usePreferencesStore.setState({
      prefs: { ...defaultPreferences, allergensAnswered: true, allergens: [], diets: [] },
    });
    const { result } = await renderHook(() => useMyRecipesForMeal('breakfast'), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.recipes.map((entry) => entry.recipe.id)).toContain('conflict');
    await act(async () =>
      usePreferencesStore.setState({
        prefs: { ...defaultPreferences, allergensAnswered: true, allergens: ['peanut'], diets: [] },
      }),
    );
    await waitFor(() =>
      expect(result.current.recipes.map((entry) => entry.recipe.id)).not.toContain('conflict'),
    );
  });

  it('suggests nothing while allergies are unanswered', async () => {
    usePreferencesStore.setState({ prefs: { ...defaultPreferences, allergensAnswered: false } });
    const { result } = await renderHook(() => useMyRecipesForMeal('breakfast'), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.recipes).toEqual([]);
  });
});
