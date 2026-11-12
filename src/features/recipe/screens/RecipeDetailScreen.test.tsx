import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import {
  getIngredients,
  getRecipeDetail,
  getRecipeSummaries,
  getSubstitutions,
} from '@/lib/catalog/queries';
import {
  useFeedbackStore,
  useMealPlanStore,
  usePantryStore,
  usePreferencesStore,
  useSavedStore,
} from '@/stores';
import { renderWithTheme } from '@/test/render';

import { RecipeDetailScreen } from './RecipeDetailScreen';
import { allergenMap, ingredient, makeDetail, prefs } from '../test/fixtures';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  }),
  Stack: { Screen: () => null },
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => (jest.requireActual('crypto') as { randomUUID: () => string }).randomUUID(),
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('react-native-webview', () => {
  const { View } = jest.requireActual<{ View: unknown }>('react-native');
  return { WebView: View };
});
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
jest.mock('@shopify/flash-list/dist/recyclerview/utils/measureLayout', () => {
  const actual = jest.requireActual<Record<string, unknown>>(
    '@shopify/flash-list/dist/recyclerview/utils/measureLayout',
  );
  const box = (width: number, height: number) => () => ({ x: 0, y: 0, width, height });
  return {
    ...actual,
    measureParentSize: jest.fn(box(400, 5000)),
    measureFirstChildLayout: jest.fn(box(400, 5000)),
    measureItemLayout: jest.fn(box(400, 60)),
  };
});

const recipe = makeDetail({
  allergens: allergenMap({ milk: 'unknown', egg: 'contains' }),
  tutorials: [
    {
      kind: 'video',
      url: 'https://youtu.be/uO0ejc85zSE',
      title: 'Curry walkthrough',
      publisher: null,
    },
  ],
});

/** Several chained catalog reads resolve before the screen settles; allow for a busy CI box. */
const SLOW = { timeout: 5000 };
jest.setTimeout(20_000);

let client: QueryClient;

function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function renderScreen() {
  await renderWithTheme(
    <Providers>
      <RecipeDetailScreen recipeId={recipe.id} />
    </Providers>,
  );
  await screen.findByText('Chickpea curry', {}, SLOW);
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockPush.mockReset();
  jest.mocked(getRecipeDetail).mockResolvedValue(recipe);
  jest.mocked(getRecipeSummaries).mockResolvedValue([]);
  jest
    .mocked(getIngredients)
    .mockImplementation(async (ids) =>
      ids.map((id) =>
        ingredient(
          id,
          id === 'egg' ? { allergens: ['egg'] } : id === 'salt' ? { pantryStaple: true } : {},
        ),
      ),
    );
  jest.mocked(getSubstitutions).mockResolvedValue([]);
  usePreferencesStore.setState({ prefs: prefs({ allergens: ['milk'], goals: ['more_fiber'] }) });
  usePantryStore.getState().reset();
  useSavedStore.getState().reset();
  useFeedbackStore.getState().reset();
  useMealPlanStore.getState().reset();
});

afterEach(() => client.clear());

describe('RecipeDetailScreen', () => {
  it('shows the recipe with its fit, ingredients and source', async () => {
    await renderScreen();
    expect(screen.getByText('Test kitchen')).toBeTruthy();
    expect(screen.getByTestId('recipe-fit')).toBeTruthy();
    expect(screen.getByText('Chickpeas')).toBeTruthy();
    expect(screen.getByText('2 cups')).toBeTruthy();
  });

  it('is honest that a declared allergen could not be verified', async () => {
    await renderScreen();
    expect(await screen.findByText('Milk: not verified', {}, SLOW)).toBeTruthy();
    expect(screen.getByText('Check before you cook')).toBeTruthy();
    expect(screen.getByText('May contain milk: ingredient data incomplete')).toBeTruthy();
  });

  it('rescales ingredients when servings change', async () => {
    await renderScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Fewer servings' }));
    await user.press(screen.getByRole('button', { name: 'Fewer servings' }));
    await waitFor(() => expect(screen.getByTestId('recipe-servings')).toHaveTextContent('2'));
    expect(screen.getByText('1 cup')).toBeTruthy();
  });

  it('switches to metric amounts', async () => {
    await renderScreen();
    await userEvent.setup().press(screen.getByRole('tab', { name: 'Metric' }));
    expect(await screen.findByText('475 ml', {}, SLOW)).toBeTruthy();
  });

  it('saves the recipe and records the save for recommendations', async () => {
    await renderScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Save' }));
    expect(useSavedStore.getState().saved[recipe.id]).toBeDefined();
    const kinds = Object.values(useFeedbackStore.getState().events).map((e) => e.kind);
    expect(kinds).toEqual(['save']);
  });

  it('opens cook mode and the why sheet', async () => {
    await renderScreen();
    const user = userEvent.setup();
    await user.press(screen.getByTestId('recipe-cook'));
    await user.press(screen.getByTestId('recipe-fit'));
    expect(mockPush.mock.calls.map(([href]) => href)).toEqual([
      { pathname: '/cook/[id]', params: { id: recipe.id } },
      { pathname: '/recipe/[id]/why', params: { id: recipe.id } },
    ]);
  });
});
