import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Share } from 'react-native';

import { FriendsScreen } from './FriendsScreen';
import {
  createFriendInvite,
  fetchFollowLists,
  fetchOpenInvites,
  fetchSecondDegree,
  followUser,
} from '../api/friendsApi';
import { fetchActiveCooks } from '../deps';
import type { Person } from '../model/connections';
import { renderWithQuery, signInForTest } from '../testing';

jest.mock('../api/friendsApi', () => ({
  fetchFollowLists: jest.fn(),
  fetchSecondDegree: jest.fn(),
  fetchOpenInvites: jest.fn(),
  createFriendInvite: jest.fn(),
  followUser: jest.fn(),
  unfollowUser: jest.fn(),
  revokeInvite: jest.fn(),
}));
jest.mock('../api/profileApi', () => ({ avatarUrl: jest.fn(() => null) }));
jest.mock('../deps', () => ({ fetchActiveCooks: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const person = (id: string, displayName: string): Person => ({
  id,
  handle: id,
  displayName,
  avatarPath: null,
  isTeam: false,
});

const ana = person('ana', 'Ana');
const ben = person('ben', 'Ben');
const cy = person('cy', 'Cy');
const dee = person('dee', 'Dee');

beforeEach(() => {
  signInForTest();
  jest.mocked(fetchFollowLists).mockResolvedValue({ following: [ana, ben], followers: [ana, cy] });
  jest.mocked(fetchSecondDegree).mockResolvedValue([{ via: 'ana', person: dee }]);
  jest.mocked(fetchActiveCooks).mockResolvedValue([]);
  jest.mocked(fetchOpenInvites).mockResolvedValue([]);
  jest.mocked(followUser).mockResolvedValue();
});

describe('FriendsScreen', () => {
  it('groups friends, followers, following and suggestions', async () => {
    await renderWithQuery(<FriendsScreen />);
    expect(await screen.findByLabelText('Ana, @ana')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Follows you' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Cy, @cy')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Following' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Ben, @ben')).toBeOnTheScreen();
    expect(
      await screen.findByLabelText('Dee, @dee, Followed by someone you follow'),
    ).toBeOnTheScreen();
  });

  it('follows back from the list', async () => {
    await renderWithQuery(<FriendsScreen />);
    await fireEvent.press(await screen.findByTestId('follow-cy'));
    await waitFor(() => expect(followUser).toHaveBeenCalledWith('cy'));
  });

  it('moves someone into Friends as soon as I follow back, before the server answers', async () => {
    jest.mocked(followUser).mockReturnValue(new Promise<void>(() => undefined));
    await renderWithQuery(<FriendsScreen />);
    await fireEvent.press(await screen.findByTestId('follow-cy'));

    await waitFor(() => expect(screen.queryByRole('header', { name: 'Follows you' })).toBeNull());
    expect(screen.getByLabelText('Cy, @cy')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Friends' })).toBeOnTheScreen();
  });

  it('puts the row back when a follow fails', async () => {
    jest.mocked(followUser).mockRejectedValue(new Error('offline'));
    await renderWithQuery(<FriendsScreen />);
    await fireEvent.press(await screen.findByTestId('follow-dee'));

    await waitFor(() => expect(followUser).toHaveBeenCalledWith('dee'));
    expect(
      await screen.findByLabelText('Dee, @dee, Followed by someone you follow'),
    ).toBeOnTheScreen();
    expect(screen.getByTestId('follow-dee')).toBeOnTheScreen();
  });

  it('opens a person', async () => {
    await renderWithQuery(<FriendsScreen />);
    await fireEvent.press(await screen.findByTestId('person-ben'));
    expect(router.push).toHaveBeenCalledWith('/author/ben');
  });

  it('creates an invite and shares the link with the plain code', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    jest
      .mocked(createFriendInvite)
      .mockResolvedValue({ code: 'ABCDEFGH23', expires_at: '2099-01-01T00:00:00Z' });
    await renderWithQuery(<FriendsScreen />);
    await fireEvent.press(await screen.findByTestId('share-invite'));
    await waitFor(() => expect(share).toHaveBeenCalled());
    const message = share.mock.calls[0]?.[0];
    expect(message).toMatchObject({
      message: expect.stringContaining('famara://invite/ABCDEFGH23'),
    });
    expect(message).toMatchObject({ message: expect.stringContaining('ABCDE FGH23') });
  });

  it('opens a typed invite code and rejects a malformed one', async () => {
    await renderWithQuery(<FriendsScreen />);
    const input = await screen.findByTestId('invite-code-input');
    await fireEvent.changeText(input, 'nope');
    await fireEvent(input, 'submitEditing');
    expect(screen.getByText(/does not look right/)).toBeOnTheScreen();

    await fireEvent.changeText(input, 'abcde fgh23');
    await fireEvent(input, 'submitEditing');
    expect(router.push).toHaveBeenCalledWith('/invite/ABCDEFGH23');
  });
});
