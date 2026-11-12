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
import { DietFlag, type RecipeSummary, type SearchPage } from '@/lib/catalog';
import { getCuisines, searchRecipes } from '@/lib/catalog/queries';
import { defaultPreferences, usePreferencesStore } from '@/stores/preferences';
import { renderWithTheme } from '@/test/render';

import { SearchScreen } from './SearchScreen';
import { allFree, searchRecipe } from '../__fixtures__/recipes';
import { EMPTY_FILTERS } from '../filters';
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

// The grid lays out over several frames; give slow CI machines room.
configure({ asyncUtilTimeout: 10_000 });

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true }),
}));

const fits = searchRecipe('mealdb:1', { title: 'Lentil soup' });
const peanutty = searchRecipe('mealdb:2', {
  title: 'Peanut noodles',
  allergens: { ...allFree(), peanut: 'contains' },
});

const page = (items: RecipeSummary[]): SearchPage => ({ items, nextCursor: null });

// Unmount, stop fetches still in flight, then empty the cache. Unmounting and settling fetches each
// schedule long garbage-collection timers; clearing last cancels them so the test worker can exit.
let client: QueryClient | undefined;
afterEach(async () => {
  await cleanup();
  await client?.cancelQueries();
  client?.clear();
});

async function renderScreen() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await renderWithTheme(
    <QueryClientProvider client={client}>
      <SearchScreen />
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(async () => {
  jest.mocked(searchRecipes).mockResolvedValue(page([fits, peanutty]));
  jest.mocked(getCuisines).mockResolvedValue([]);
  await act(async () => {
    useSearchStore.getState().reset();
    useRecentSearchesStore.setState({ ownerId: null, terms: [] });
    usePreferencesStore.setState({
      prefs: { ...defaultPreferences, allergens: ['peanut'], allergensAnswered: true },
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

describe('SearchScreen', () => {
  it('shows matching recipes and marks the ones that do not fit, without hiding them', async () => {
    await renderScreen();
    expect(await screen.findByTestId('search-result-mealdb:2')).toBeOnTheScreen();
    expect(screen.getByTestId('search-result-mealdb:1')).toBeOnTheScreen();
    // The badge is decorative for VoiceOver (the card label carries the reason), so it is hidden.
    expect(screen.getAllByTestId('safety-badge', { includeHiddenElements: true })).toHaveLength(1);
    expect(
      screen.getByLabelText(/^Peanut noodles\..*Does not fit you: Contains peanuts$/),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Lentil soup\./).props.accessibilityLabel).not.toMatch(
      /Does not fit/,
    );
  });

  it('searches for what was typed once typing settles', async () => {
    await renderScreen();
    await screen.findByTestId('search-result-mealdb:1');
    const input = screen.getByTestId('search-input');
    await fireEvent.changeText(input, 'le');
    await fireEvent.changeText(input, 'len');
    // Timing itself is covered by useDebouncedValue's fake-timer tests.
    await waitFor(() => expect(searchRecipes).toHaveBeenLastCalledWith('len', {}, 0));
  });

  it('passes the chosen filters to the catalog query and lists them as removable chips', async () => {
    await act(async () => {
      useSearchStore.getState().setFilters({ ...EMPTY_FILTERS, diets: ['vegan'], maxMinutes: 30 });
    });
    await renderScreen();
    await waitFor(() =>
      expect(searchRecipes).toHaveBeenCalledWith(
        '',
        { dietMask: DietFlag.vegan, maxMinutes: 30 },
        0,
      ),
    );
    await userEvent.setup().press(screen.getByRole('button', { name: 'Remove filter: Vegan' }));
    expect(useSearchStore.getState().filters.diets).toEqual([]);
    await waitFor(() => expect(searchRecipes).toHaveBeenLastCalledWith('', { maxMinutes: 30 }, 0));
  });

  it('remembers the search when a result is opened and shows it as a recent search', async () => {
    await renderScreen();
    await fireEvent.changeText(screen.getByTestId('search-input'), 'soup');
    await waitFor(() => expect(searchRecipes).toHaveBeenCalledWith('soup', {}, 0));
    await userEvent.setup().press(await screen.findByTestId('search-result-mealdb:1'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/recipe/[id]',
      params: { id: 'mealdb:1' },
    });
    expect(useRecentSearchesStore.getState()).toMatchObject({
      ownerId: 'user-1',
      terms: ['soup'],
    });

    await fireEvent.changeText(screen.getByTestId('search-input'), '');
    expect(await screen.findByRole('button', { name: 'Search again for soup' })).toBeOnTheScreen();
  });

  it('keeps the previous results dimmed, with a progress cue, while a new search loads', async () => {
    await renderScreen();
    await screen.findByTestId('search-result-mealdb:1');
    expect(screen.queryByTestId('search-updating')).toBeNull();
    jest.mocked(searchRecipes).mockReturnValue(new Promise<SearchPage>(() => {}));
    await fireEvent.changeText(screen.getByTestId('search-input'), 'curry');
    expect(await screen.findByTestId('search-updating')).toBeOnTheScreen();
    expect(screen.getByTestId('search-result-mealdb:1')).toBeOnTheScreen();
  });

  it('offers ways out when nothing matches', async () => {
    await renderScreen();
    await screen.findByTestId('search-result-mealdb:1');
    jest.mocked(searchRecipes).mockResolvedValue(page([]));
    await fireEvent.changeText(screen.getByTestId('search-input'), 'spicy lentil');
    expect(await screen.findByTestId('search-no-results')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Search “lentil”' }));
    expect(useSearchStore.getState().query).toBe('lentil');
  });

  it('asks for AI consent before showing Chef', async () => {
    await renderScreen();
    await userEvent.setup().press(screen.getByRole('tab', { name: 'Chef' }));
    expect(screen.getByText('Meet Chef')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Review and turn on' }));
    expect(mockPush).toHaveBeenCalledWith('/ai-consent');
  });

  it('shows the Chef chat to adults who agreed to AI features', async () => {
    await act(async () => {
      useSessionStore.setState({ aiConsent: true });
    });
    await renderScreen();
    await userEvent.setup().press(screen.getByRole('tab', { name: 'Chef' }));
    expect(screen.getByTestId('chef-pane')).toBeOnTheScreen();
  });
});
