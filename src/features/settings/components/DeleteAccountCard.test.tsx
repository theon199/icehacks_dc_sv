import { screen, userEvent, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';

import { useSessionStore } from '@/features/auth';
import { renderWithTheme } from '@/test/render';

import { resetSettingsDepsForTests, savePersonalDetails, updatePreferences } from '../deps';
import { confirmsDeletion, DeleteAccountCard } from './DeleteAccountCard';

const mockClient = {
  rpc: jest.fn(),
  auth: { signOut: jest.fn() },
};
jest.mock('@/lib/supabase/client', () => ({ getSupabase: () => mockClient }));

const thisYear = new Date().getFullYear();

beforeEach(() => {
  resetSettingsDepsForTests();
  useSessionStore.getState().signedIn({
    userId: 'user-1',
    birthYear: thisYear - 40,
    onboardingComplete: true,
  });
  mockClient.auth.signOut.mockResolvedValue({ error: null });
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

  it('deletes the account, clears this device and signs out', async () => {
    mockClient.rpc.mockResolvedValue({
      data: { deleted: true, storage_objects_queued: 2 },
      error: null,
    });
    updatePreferences({ allergens: ['peanut'] });
    await savePersonalDetails({ heightCm: 170, weightKg: 70, sex: null, activity: null });

    const user = await openAndType('delete');
    expect(screen.getByTestId('account-delete-confirm')).toBeEnabled();
    await user.press(screen.getByTestId('account-delete-confirm'));

    await waitFor(() => expect(useSessionStore.getState().status).toBe('signedOut'));
    expect(mockClient.rpc).toHaveBeenCalledWith('delete_my_account');
    expect(mockClient.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(await SecureStore.getItemAsync('famara.personal-details.user-1')).toBeNull();
  });

  it('shows the problem and stays signed in when deletion fails', async () => {
    mockClient.rpc.mockResolvedValue({ data: null, error: { code: 'PT401', message: 'x' } });
    const user = await openAndType('DELETE');
    await user.press(screen.getByTestId('account-delete-confirm'));

    expect(await screen.findByText('Could not delete your account. Try again.')).toBeOnTheScreen();
    expect(mockClient.auth.signOut).not.toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe('ready');
  });

  it('can be cancelled', async () => {
    const user = await openAndType('DEL');
    await user.press(screen.getByRole('button', { name: 'Keep my account' }));
    expect(screen.queryByTestId('account-delete-card')).not.toBeOnTheScreen();
  });
});
