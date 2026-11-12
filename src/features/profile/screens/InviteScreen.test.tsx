import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { ApiError } from '@/lib/api/errors';

import { InviteScreen } from './InviteScreen';
import { redeemFriendInvite } from '../api/friendsApi';
import { renderWithQuery, signInForTest } from '../testing';

jest.mock('../api/friendsApi', () => ({ redeemFriendInvite: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: jest.fn(() => true) },
}));

const redeem = jest.mocked(redeemFriendInvite);

function dbFailure(code: string, status: number, kind: ApiError['kind'] = 'validation') {
  return new ApiError({ kind, functionName: 'redeem_friend_invite', code, status });
}

beforeEach(() => {
  redeem.mockReset();
  signInForTest();
});

async function acceptInvite(code = 'abcde-fgh23') {
  await renderWithQuery(<InviteScreen code={code} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Accept invite' }));
}

describe('InviteScreen', () => {
  it('explains a broken link without contacting the server', async () => {
    await renderWithQuery(<InviteScreen code="nope" />);
    expect(screen.getByText("This link doesn't work")).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Accept invite' })).toBeNull();
    expect(redeem).not.toHaveBeenCalled();
  });

  it('waits for the person to accept, then connects them', async () => {
    redeem.mockResolvedValue({ inviter_id: 'inviter-1', inviter_handle: 'ama_cooks' });
    await renderWithQuery(<InviteScreen code="abcde-fgh23" />);
    expect(screen.getByText(/ABCDE FGH23/)).toBeOnTheScreen();
    expect(redeem).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Accept invite' }));

    expect(await screen.findByText("You're now friends")).toBeOnTheScreen();
    expect(redeem).toHaveBeenCalledWith('ABCDEFGH23');
    expect(screen.getByText(/@ama_cooks/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'View their profile' }));
    expect(router.replace).toHaveBeenCalledWith('/author/inviter-1');
  });

  it('says clearly when the invite has expired', async () => {
    redeem.mockRejectedValue(dbFailure('invite_not_found', 404, 'server'));
    await acceptInvite();
    expect(await screen.findByText('This invite has expired')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('says clearly when the invite was already used', async () => {
    redeem.mockRejectedValue(dbFailure('invite_used', 409));
    await acceptInvite();
    expect(await screen.findByText('This invite was already used')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('recognises your own invite', async () => {
    redeem.mockRejectedValue(dbFailure('invalid_target', 400));
    await acceptInvite();
    expect(await screen.findByText('This is your own invite')).toBeOnTheScreen();
  });

  it('lets you retry after a connection problem', async () => {
    redeem
      .mockRejectedValueOnce(
        new ApiError({ kind: 'network', functionName: 'redeem_friend_invite' }),
      )
      .mockResolvedValueOnce({ inviter_id: 'inviter-1', inviter_handle: 'ama_cooks' });
    await acceptInvite();
    expect(await screen.findByText("You're offline")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText("You're now friends")).toBeOnTheScreen());
    expect(redeem).toHaveBeenCalledTimes(2);
  });

  it('closes from any state', async () => {
    await renderWithQuery(<InviteScreen code="ABCDEFGH23" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
    expect(router.back).toHaveBeenCalled();
  });
});
