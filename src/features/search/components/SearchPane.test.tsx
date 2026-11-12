import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  configure,
  fireEvent,
  screen,
  userEvent,
  waitFor,
} from '@testing-library/react-native';

import { useSessionStore } from '@/features/auth';
import type { RecipeSummary, SearchPage } from '@/lib/catalog';
import { getCuisines, searchRecipes } from '@/lib/catalog/queries';
import { defaultPreferences, usePreferencesStore } from '@/stores/preferences';
import { renderWithTheme } from '@/test/render';

import { SearchPane } from './SearchPane';
import { searchRecipe } from '../__fixtures__/recipes';
import { useRecentSearchesStore } from '../recentSearches';
import { useSearchStore } from '../searchStore';

jest.mock('@/lib/catalog/queries', () => ({
  ...jest.requireActual('@/lib/catalog/queries'),
  searchRecipes: jest.fn(),
  getCuisines: jest.fn(),
}));

// FlashList measures its container natively; give it a fixed viewport under Jest.
jest.mock('@shopify/flash-list/dist/recyclerview/utils/measureLayout', () => {
  const actual = jest.requireActual('@shopify/flash-list/dist/recyclerview/utils/measureLayout');
  const box = (width: number, height: number) => () => ({ x: 0, y: 0, width, height });
  return {
    ...actual,
    measureParentSize: jest.fn(box(400, 900)),
    measureFirstChildLayout: jest.fn(box(400, 900)),
    measureItemLayout: jest.fn(box(180, 240)),
  };
});

// Typing settles at once unless a test holds it, so "still typing" does not depend on timing.
const mockTyping = { held: false, settled: '' as unknown };
jest.mock('../useDebouncedValue', () => ({
  SEARCH_DEBOUNCE_MS: 0,
  useDebouncedValue: <T,>(value: T): T => {
    if (!mockTyping.held) mockTyping.settled = value;
    return mockTyping.settled as T;
  },
}));

configure({ asyncUtilTimeout: 10_000 });

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true }),
}));

const soup = searchRecipe('mealdb:1', { title: 'Lentil soup' });
const page = (items: RecipeSummary[]): SearchPage => ({ items, nextCursor: null });

let client: QueryClient | undefined;
afterEach(async () => {
  await cleanup();
  await client?.cancelQueries();
  client?.clear();
});

beforeEach(async () => {
  mockTyping.held = false;
  mockTyping.settled = '';
  jest
    .mocked(searchRecipes)
    .mockReset()
    .mockResolvedValue(page([soup]));
  jest.mocked(getCuisines).mockResolvedValue([]);
  await act(async () => {
    useSearchStore.getState().reset();
    useRecentSearchesStore.setState({ ownerId: null, terms: [] });
    usePreferencesStore.setState({
      prefs: { ...defaultPreferences, allergens: [], allergensAnswered: true },
    });
    useSessionStore.setState({
      status: 'ready',
      userId: 'user-1',
      birthYear: 1990,
      onboardingComplete: true,
      aiConsent: false,
    });
  });
});

async function renderPane() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await renderWithTheme(
    <QueryClientProvider client={client}>
      <SearchPane />
    </QueryClientProvider>,
  );
}

describe('SearchPane', () => {
  it('remembers the search that found the recipe, not text still being typed', async () => {
    await renderPane();
    await fireEvent.changeText(screen.getByTestId('search-input'), 'soup');
    await waitFor(() => expect(searchRecipes).toHaveBeenCalledWith('soup', {}, 0));
    const result = await screen.findByTestId('search-result-mealdb:1');

    mockTyping.held = true;
    await fireEvent.changeText(screen.getByTestId('search-input'), 'soup wi');
    await userEvent.setup().press(result);

    expect(mockPush).toHaveBeenCalled();
    expect(useRecentSearchesStore.getState().terms).toEqual(['soup']);
  });

  it('does not search again when only spacing, case or punctuation changes', async () => {
    await renderPane();
    const input = screen.getByTestId('search-input');
    await fireEvent.changeText(input, 'lentil soup');
    await waitFor(() => expect(searchRecipes).toHaveBeenLastCalledWith('lentil soup', {}, 0));
    await screen.findByTestId('search-result-mealdb:1');
    const calls = jest.mocked(searchRecipes).mock.calls.length;

    await fireEvent.changeText(input, 'lentil soup ');
    await fireEvent.changeText(input, '  Lentil   Soup!');
    expect(screen.getByTestId('search-result-mealdb:1')).toBeOnTheScreen();
    expect(searchRecipes).toHaveBeenCalledTimes(calls);
  });
});
