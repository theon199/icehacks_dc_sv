import { fireEvent, screen } from '@testing-library/react-native';

import { useSessionStore } from '@/features/auth';

import { CommunityScreen } from './CommunityScreen';
import { fetchFeedPage, fetchWeeklyTopDishes } from '../api/communityApi';
import { makePage, makePost } from '../testing/fixtures';
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
  blockUser: jest.fn(),
}));

jest.mock('../deps', () => ({
  getRecipeSummaries: jest.fn(async () => []),
}));

const feedMock = jest.mocked(fetchFeedPage);

beforeEach(() => {
  useSessionStore.setState({ userId: 'me', status: 'ready' });
  jest.mocked(fetchWeeklyTopDishes).mockResolvedValue([]);
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
});
