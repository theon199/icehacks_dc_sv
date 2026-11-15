import { fireEvent, screen } from '@testing-library/react-native';

import type * as CatalogModule from '@/lib/catalog';
import { defaultPreferences, usePreferencesStore } from '@/stores';

import { AddMealSheet } from './AddMealSheet';
import { makeCandidate } from '../__fixtures__/recipes';
import { clearQueryClients, renderCookbook } from '../__fixtures__/render';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockSaved: { recipes: CatalogModule.RecipeSummary[] } = { recipes: [] };
jest.mock('../hooks/useSavedRecipes', () => ({
  useSavedRecipes: () => ({
    ids: mockSaved.recipes.map((r) => r.id),
    recipes: mockSaved.recipes,
    isSafe: () => true,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

const mockSearch = { results: [] as CatalogModule.RecipeSummary[], lastQuery: '' };
jest.mock('@/lib/catalog', () => {
  const actual = jest.requireActual<typeof CatalogModule>('@/lib/catalog');
  return {
    ...actual,
    useRecipeSearch: (query: string) => {
      mockSearch.lastQuery = query;
      return {
        data: { pages: [{ items: query ? mockSearch.results : [] }] },
        isPending: false,
        error: null,
        hasNextPage: false,
        isFetchingNextPage: false,
        fetchNextPage: jest.fn(),
      };
    },
  };
});

function recipe(id: string, title: string): CatalogModule.RecipeSummary {
  return { ...makeCandidate(id), title };
}

function answered(allergensAnswered: boolean) {
  usePreferencesStore.setState({ prefs: { ...defaultPreferences, allergensAnswered } });
}

function renderSheet() {
  return renderCookbook(
    <AddMealSheet
      slot="dinner"
      dayLabel="Saturday Nov 14"
      onPick={jest.fn()}
      onClose={jest.fn()}
    />,
  );
}

afterEach(() => {
  clearQueryClients();
  mockSaved.recipes = [];
  mockSearch.results = [];
});

describe('AddMealSheet', () => {
  it('titles the slot, dates it and lists saved recipes before any search', async () => {
    answered(true);
    mockSaved.recipes = [recipe('r1', 'Quinoa Salad')];
    await renderSheet();
    expect(screen.getByText('Add dinner')).toBeOnTheScreen();
    expect(screen.getByText('Saturday Nov 14')).toBeOnTheScreen();
    expect(screen.getByText('Your saved recipes')).toBeOnTheScreen();
    expect(screen.getByText('Quinoa Salad')).toBeOnTheScreen();
    expect(mockSearch.lastQuery).toBe('');
  });

  it('says so when nothing is saved yet', async () => {
    answered(true);
    await renderSheet();
    expect(screen.getByText('No saved recipes yet. Search above to find one.')).toBeOnTheScreen();
  });

  it('searches the whole catalog once the person types', async () => {
    answered(true);
    mockSaved.recipes = [recipe('r1', 'Quinoa Salad')];
    mockSearch.results = [recipe('r2', 'Spanish Chicken')];
    await renderSheet();
    await fireEvent.changeText(screen.getByLabelText('Search recipes'), 'chicken');
    expect(mockSearch.lastQuery).toBe('chicken');
    expect(screen.getByText('Spanish Chicken')).toBeOnTheScreen();
    expect(screen.queryByText('Quinoa Salad')).toBeNull();
    expect(screen.queryByText('Your saved recipes')).toBeNull();
  });

  it('offers nothing until allergens are answered', async () => {
    answered(false);
    mockSaved.recipes = [recipe('r1', 'Quinoa Salad')];
    await renderSheet();
    expect(screen.getByText('Tell us about allergies first')).toBeOnTheScreen();
    expect(screen.queryByText('Quinoa Salad')).toBeNull();
  });
});
