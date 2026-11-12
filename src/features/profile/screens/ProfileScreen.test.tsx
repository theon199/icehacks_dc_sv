import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import type { MyStats } from '@/lib/supabase/database.types';

import { ProfileScreen } from './ProfileScreen';
import { fetchBadgeCatalog, fetchMyStats, fetchProfile } from '../api/profileApi';
import { fetchAuthorPosts } from '../deps';
import { renderWithQuery, signInForTest, TEST_USER_ID } from '../testing';

jest.mock('../api/profileApi', () => ({
  fetchProfile: jest.fn(),
  fetchMyStats: jest.fn(),
  fetchBadgeCatalog: jest.fn(),
  avatarUrl: jest.fn(() => null),
  updateProfile: jest.fn(),
  replaceAvatar: jest.fn(),
  clearAvatar: jest.fn(),
}));
jest.mock('../deps', () => ({
  fetchAuthorPosts: jest.fn(),
  listCatalogCuisines: jest.fn(() => Promise.resolve([])),
}));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const stats: MyStats = {
  cooked_count: 8,
  cooked_this_week: 2,
  current_streak: 3,
  longest_streak: 5,
  last_cooked_at: null,
  cuisine_count: 2,
  cuisines: [{ cuisine: 'thai', count: 5 }],
  post_count: 1,
  likes_received: 4,
  badges: [{ badge_id: 'first_cook', awarded_at: '2026-11-01T00:00:00Z' }],
};

beforeEach(() => {
  signInForTest();
  jest.mocked(fetchProfile).mockResolvedValue({
    id: TEST_USER_ID,
    handle: 'ama_cooks',
    display_name: 'Ama Owusu',
    avatar_path: null,
    bio: 'Jollof every Sunday.',
    cuisines: ['west_african'],
    is_team: false,
  });
  jest.mocked(fetchMyStats).mockResolvedValue(stats);
  jest.mocked(fetchBadgeCatalog).mockResolvedValue([
    {
      id: 'first_cook',
      name: 'First dish',
      description: 'Cook your first dish.',
      metric: 'cook_count',
      threshold: 1,
      sort_order: 1,
    },
    {
      id: 'cooks_10',
      name: 'Ten dishes',
      description: 'Cook 10 dishes.',
      metric: 'cook_count',
      threshold: 10,
      sort_order: 2,
    },
  ]);
  jest.mocked(fetchAuthorPosts).mockResolvedValue({ items: [], nextCursor: null });
});

describe('ProfileScreen', () => {
  it('shows who I am, my stats and my badges', async () => {
    await renderWithQuery(<ProfileScreen />);

    expect(await screen.findByText('Ama Owusu')).toBeOnTheScreen();
    expect(screen.getByText('@ama_cooks')).toBeOnTheScreen();
    expect(screen.getByText('Jollof every Sunday.')).toBeOnTheScreen();
    expect(screen.getByLabelText('West African')).toBeOnTheScreen();

    expect(await screen.findByLabelText('8 dishes cooked, 2 this week')).toBeOnTheScreen();
    expect(screen.getByLabelText('3 days in a row, best 5')).toBeOnTheScreen();

    expect(await screen.findByText('1 of 2 earned')).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Ten dishes, not earned yet, 8 of 10/)).toBeOnTheScreen();
    expect(fetchAuthorPosts).toHaveBeenCalledWith(TEST_USER_ID, null);
  });

  it('holds the badge grid back until my stats arrive', async () => {
    jest.mocked(fetchMyStats).mockReturnValue(new Promise<MyStats>(() => undefined));
    await renderWithQuery(<ProfileScreen />);
    expect(await screen.findByText('Ama Owusu')).toBeOnTheScreen();
    await waitFor(() => expect(fetchBadgeCatalog).toHaveBeenCalled());

    expect(screen.queryByText(/of 2 earned/)).toBeNull();
    expect(screen.queryByTestId('badge-first_cook')).toBeNull();
  });

  it('reports a stats failure under badges instead of showing them all locked', async () => {
    jest.mocked(fetchMyStats).mockRejectedValue(new Error('offline'));
    await renderWithQuery(<ProfileScreen />);

    expect(await screen.findByText("Badges didn't load")).toBeOnTheScreen();
    expect(screen.getByText("Stats didn't load")).toBeOnTheScreen();
    expect(screen.queryByText(/of 2 earned/)).toBeNull();
    expect(screen.queryByTestId('badge-first_cook')).toBeNull();

    jest.mocked(fetchMyStats).mockResolvedValue(stats);
    const retries = screen.getAllByRole('button', { name: 'Try again' });
    await fireEvent.press(retries[retries.length - 1]!);
    expect(await screen.findByText('1 of 2 earned')).toBeOnTheScreen();
  });

  it('invites a first post when there are none', async () => {
    await renderWithQuery(<ProfileScreen />);
    expect(await screen.findByText('Nothing shared yet')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Share a dish' }));
    expect(router.push).toHaveBeenCalledWith('/compose');
  });

  it('opens settings and friends', async () => {
    await renderWithQuery(<ProfileScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Settings' }));
    expect(router.push).toHaveBeenCalledWith('/settings');
    await fireEvent.press(screen.getByRole('button', { name: 'Friends' }));
    expect(router.push).toHaveBeenCalledWith('/friends');
  });

  it('opens the edit sheet', async () => {
    await renderWithQuery(<ProfileScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Edit profile' }));
    expect(screen.getByTestId('edit-profile-sheet')).toBeOnTheScreen();
  });

  it('offers a retry when the profile fails to load', async () => {
    jest.mocked(fetchProfile).mockRejectedValue(new Error('boom'));
    await renderWithQuery(<ProfileScreen />);
    expect(await screen.findByText("Your profile didn't load")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });
});
