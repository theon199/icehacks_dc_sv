import { fireEvent, screen } from '@testing-library/react-native';

import { useSessionStore } from '@/features/auth';
import { getRecipeSummaries } from '@/lib/catalog';
import { defaultPreferences, usePreferencesStore, type Preferences } from '@/stores';

import { CommunityScreen } from './CommunityScreen';
import { fetchFeedPage, fetchWeeklyTopDishes } from '../api/communityApi';
import { makePage, makePost, makeRecipe } from '../testing/fixtures';
import { renderWithClient } from '../testing/renderWithClient';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), canGoBack: () => true },
  Stack: { Screen: () => null },
}));

jest.mock('../api/communityApi', () => ({
  fetchFeedPage: jest.fn(),
  fetchWeeklyTopDishes: jest.fn(),
  toggleLike: jest.fn(),
  toggleSave: jest.fn(),
  deletePost: jest.fn(),
}));

jest.mock('@/lib/catalog', () => ({
  getRecipeSummaries: jest.fn(async () => []),
  searchRecipes: jest.fn(async () => ({ items: [], nextCursor: null })),
}));

const feedMock = jest.mocked(fetchFeedPage);
const weeklyMock = jest.mocked(fetchWeeklyTopDishes);
const summariesMock = jest.mocked(getRecipeSummaries);

function setPrefs(patch: Partial<Preferences>) {
  usePreferencesStore.setState({ prefs: { ...defaultPreferences, ...patch } });
}

const topRow = (recipeRef: string, cooks: number) => ({
  recipe_ref: recipeRef,
  cook_count: cooks,
  cooks,
  avg_rating: null,
  post_count: 0,
});

beforeEach(() => {
  useSessionStore.setState({ userId: 'me', status: 'ready' });
  weeklyMock.mockResolvedValue([]);
  setPrefs({ allergens: [], allergensAnswered: true });
});

describe('CommunityScreen', () => {
  it('shows posts from the feed, including clearly labelled team posts', async () => {
    feedMock.mockResolvedValue(
      makePage([
        makePost({ title: 'Lentil soup, my way' }),
        makePost({
          title: 'Taste before you salt',
          kind: 'tip',
          recipe_ref: null,
          rating: null,
          author_is_team: true,
          author_display_name: 'Famara Team',
        }),
      ]),
    );
    await renderWithClient(<CommunityScreen />);

    expect(await screen.findByText('Lentil soup, my way')).toBeTruthy();
    expect(screen.getByText('Taste before you salt')).toBeTruthy();
    expect(screen.getByLabelText(/Famara Team, official account/)).toBeTruthy();
  });

  it('points an empty Following feed at friends and Discover', async () => {
    feedMock.mockResolvedValue(makePage([]));
    await renderWithClient(<CommunityScreen />);

    await fireEvent.press(screen.getByRole('tab', { name: 'Following' }));

    expect(await screen.findByText('Nothing from your people yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Find friends' })).toBeTruthy();
    expect(feedMock).toHaveBeenCalledWith(expect.objectContaining({ mode: 'following' }));
  });

  describe('Cooked most this week', () => {
    const satay = makeRecipe({
      id: 'mealdb:10',
      title: 'Chicken satay',
      allergens: { ...makeRecipe().allergens, peanut: 'contains' },
    });
    const curry = makeRecipe({
      id: 'mealdb:11',
      title: 'Peanut-free curry',
    });
    const unverified = makeRecipe({
      id: 'mealdb:12',
      title: 'Mystery stew',
      allergens: { ...makeRecipe().allergens, peanut: 'unknown' },
    });

    beforeEach(() => {
      feedMock.mockResolvedValue(makePage([]));
      weeklyMock.mockResolvedValue([
        topRow('mealdb:10', 9),
        topRow('mealdb:11', 5),
        topRow('mealdb:12', 4),
      ]);
      summariesMock.mockImplementation(async (ids) =>
        [satay, curry, unverified].filter((recipe) => ids.includes(recipe.id)),
      );
    });

    it('leaves out dishes with a declared allergen or an unverified status', async () => {
      setPrefs({ allergens: ['peanut'], allergensAnswered: true });
      await renderWithClient(<CommunityScreen />);

      expect(await screen.findByText('Peanut-free curry')).toBeTruthy();
      expect(screen.getByText('Cooked most this week')).toBeTruthy();
      expect(screen.queryByText('Chicken satay')).toBeNull();
      expect(screen.queryByText('Mystery stew')).toBeNull();
    });

    it('stays hidden until the allergen question is answered', async () => {
      setPrefs({ allergens: [], allergensAnswered: false });
      await renderWithClient(<CommunityScreen />);

      expect(
        await screen.findByText(/No popular dishes|No posts yet|Nothing from your people/),
      ).toBeTruthy();
      expect(screen.queryByText('Cooked most this week')).toBeNull();
      expect(screen.queryByText('Peanut-free curry')).toBeNull();
      expect(weeklyMock).not.toHaveBeenCalled();
    });
  });
});
