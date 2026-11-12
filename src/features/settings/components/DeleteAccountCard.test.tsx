import { screen, userEvent, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';

import { useSessionStore } from '@/features/auth';
import type * as SyncModule from '@/lib/sync';
import {
  defaultPreferences,
  resetUserStores,
  usePersonalDetailsStore,
  usePreferencesStore,
} from '@/stores';
import { renderWithTheme } from '@/test/render';

import { confirmsDeletion, DeleteAccountCard } from './DeleteAccountCard';

type RpcReply = { data: unknown; error: unknown };
let rpcReply: RpcReply = { data: { deleted: true }, error: null };
/** Whether this device still stores a session. */
let stored = true;
const mockClient = {
  rpc: jest.fn((_name: string) => ({
    setHeader: () => Promise.resolve(rpcReply),
    then: (resolve: (value: RpcReply) => unknown) => Promise.resolve(rpcReply).then(resolve),
  })),
  auth: { signOut: jest.fn(), getSession: jest.fn() },
};
jest.mock('@/lib/supabase/client', () => ({ getSupabase: () => mockClient }));

const mockDeletedCleanup = jest.fn();
const mockSignOutCleanup = jest.fn();
jest.mock('@/lib/sync', () => {
  const actual = jest.requireActual<typeof SyncModule>('@/lib/sync');
  return {
    ...actual,
    accountDeletedCleanup: () => {
      mockDeletedCleanup();
      return actual.accountDeletedCleanup();
    },
    signOutCleanup: (options?: { flushTimeoutMs?: number }) => {
      mockSignOutCleanup();
      return actual.signOutCleanup(options);
    },
  };
});

const thisYear = new Date().getFullYear();

beforeEach(() => {
  resetUserStores();
  stored = true;
  rpcReply = { data: { deleted: true }, error: null };
  useSessionStore.getState().signedIn({
    userId: 'user-1',
    birthYear: thisYear - 40,
    onboardingComplete: true,
  });
  mockClient.auth.signOut.mockImplementation(async () => {
    stored = false;
    return { error: null };
  });
  mockClient.auth.getSession.mockImplementation(async () => ({
    data: { session: stored ? { access_token: 't', user: { id: 'user-1' } } : null },
    error: null,
  }));
});

async function openAndType(text: string) {
  const user = userEvent.setup();
  await renderWithTheme(<DeleteAccountCard />);
  await user.press(screen.getByTestId('account-delete-start'));
  await user.type(screen.getByTestId('account-delete-input'), text);
  return user;
}

describe('confirmsDeletion', () => {
  it.each([
    ['DELETE', true],
    ['  delete ', true],
    ['DELET', false],
    ['', false],
    ['delete my account', false],
  ])('%p -> %p', (typed, expected) => {
    expect(confirmsDeletion(typed)).toBe(expected);
  });
});

describe('DeleteAccountCard', () => {
  it('keeps the delete button disabled until the phrase is typed', async () => {
    await openAndType('DELE');
    expect(screen.getByTestId('account-delete-confirm')).toBeDisabled();
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });

  it('deletes the account through the auth feature, wipes this device and signs out', async () => {
    rpcReply = { data: { deleted: true, storage_objects_queued: 2 }, error: null };
    usePreferencesStore.getState().setAllergens(['peanut']);
    usePersonalDetailsStore.getState().update({ heightCm: 170, weightKg: 70 });
    await SecureStore.setItemAsync('famara.personal-details.user-1', '{"heightCm":170}');

    const user = await openAndType('delete');
    expect(screen.getByTestId('account-delete-confirm')).toBeEnabled();
    await user.press(screen.getByTestId('account-delete-confirm'));

    await waitFor(() => expect(useSessionStore.getState().status).toBe('signedOut'));
    expect(mockClient.rpc).toHaveBeenCalledWith('delete_my_account');
    expect(mockDeletedCleanup).toHaveBeenCalledTimes(1);
    // Nothing is pushed to an account that no longer exists.
    expect(mockSignOutCleanup).not.toHaveBeenCalled();
    expect(mockClient.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(usePreferencesStore.getState().prefs).toEqual(defaultPreferences);
    expect(usePersonalDetailsStore.getState().details.heightCm).toBeNull();
    expect(await SecureStore.getItemAsync('famara.personal-details.user-1')).toBeNull();
  });

  it('still signs out when clearing this device fails after the account was deleted', async () => {
    mockDeletedCleanup.mockImplementationOnce(() => {
      throw new Error('could not reset a store');
    });
    const user = await openAndType('DELETE');
    await user.press(screen.getByTestId('account-delete-confirm'));

    await waitFor(() => expect(useSessionStore.getState().status).toBe('signedOut'));
    expect(mockClient.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('shows the problem and stays signed in when deletion fails', async () => {
    rpcReply = { data: null, error: { code: 'XX000', message: 'boom' } };
    const user = await openAndType('DELETE');
    await user.press(screen.getByTestId('account-delete-confirm'));

    expect(await screen.findByText('Could not delete your account. Try again.')).toBeOnTheScreen();
    expect(mockDeletedCleanup).not.toHaveBeenCalled();
    expect(mockClient.auth.signOut).not.toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe('ready');
  });

  it('can be cancelled', async () => {
    const user = await openAndType('DEL');
    await user.press(screen.getByRole('button', { name: 'Keep my account' }));
    expect(screen.queryByTestId('account-delete-card')).not.toBeOnTheScreen();
  });
});
