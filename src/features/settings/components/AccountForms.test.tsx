import { screen, userEvent, waitFor } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/render';
import { useToastStore } from '@/ui';

import { ChangeEmailForm, emailProblem } from './ChangeEmailForm';
import { ChangePasswordForm, passwordProblem } from './ChangePasswordForm';

jest.mock('expo-linking', () => ({ createURL: (path: string) => `famara://${path}` }));

const mockAuth = { updateUser: jest.fn(), signInWithPassword: jest.fn() };
jest.mock('@/lib/supabase/client', () => ({ getSupabase: () => ({ auth: mockAuth }) }));

beforeEach(() => {
  useToastStore.getState().clear();
});

describe('passwordProblem', () => {
  it('asks for a longer password first, then for matching fields', () => {
    expect(passwordProblem('short', 'short')).toBe('Use at least 8 characters.');
    expect(passwordProblem('long-enough', 'long-enougj')).toBe('The two passwords do not match.');
    expect(passwordProblem('long-enough', 'long-enough')).toBeNull();
  });
});

describe('emailProblem', () => {
  it('refuses malformed addresses and the current one', () => {
    expect(emailProblem('nope', 'a@b.co')).toBe('Enter a valid email address.');
    expect(emailProblem(' A@B.co ', 'a@b.co')).toBe('That is already your email address.');
    expect(emailProblem('new@b.co', 'a@b.co')).toBeNull();
  });
});

describe('ChangeEmailForm', () => {
  it('sends the confirmation, clears the field and reports back', async () => {
    mockAuth.updateUser.mockResolvedValue({ data: {}, error: null });
    const onChanged = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(<ChangeEmailForm currentEmail="sam@example.com" onChanged={onChanged} />);
    await user.type(screen.getByTestId('account-email-input'), 'sam@new.example.com');
    await user.press(screen.getByTestId('account-email-submit'));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(mockAuth.updateUser).toHaveBeenCalledWith(
      { email: 'sam@new.example.com' },
      { emailRedirectTo: 'famara:///auth/callback' },
    );
    expect(screen.getByTestId('account-email-input')).toHaveDisplayValue('');
    expect(useToastStore.getState().queue[0]?.tone).toBe('success');
  });

  it('explains a refused address and clears the message once the person edits it', async () => {
    const user = userEvent.setup();
    await renderWithTheme(<ChangeEmailForm currentEmail="sam@example.com" onChanged={jest.fn()} />);
    await user.type(screen.getByTestId('account-email-input'), 'sam@example.com');
    await user.press(screen.getByTestId('account-email-submit'));
    expect(screen.getByText('That is already your email address.')).toBeOnTheScreen();
    expect(mockAuth.updateUser).not.toHaveBeenCalled();

    await user.type(screen.getByTestId('account-email-input'), 'x');
    expect(screen.queryByText('That is already your email address.')).not.toBeOnTheScreen();
  });

  it('shows the server problem in words', async () => {
    mockAuth.updateUser.mockResolvedValue({ data: {}, error: { code: 'email_exists' } });
    const user = userEvent.setup();
    await renderWithTheme(<ChangeEmailForm currentEmail={null} onChanged={jest.fn()} />);
    await user.type(screen.getByTestId('account-email-input'), 'taken@example.com');
    await user.press(screen.getByTestId('account-email-submit'));
    expect(
      await screen.findByText('That email is already used by another account.'),
    ).toBeOnTheScreen();
  });
});

describe('ChangePasswordForm', () => {
  it('lets an Apple or Google account set its first password and asks for a refresh', async () => {
    mockAuth.updateUser.mockResolvedValue({ data: {}, error: null });
    const onChanged = jest.fn();
    const user = userEvent.setup();
    await renderWithTheme(
      <ChangePasswordForm email="kai@example.com" hasPassword={false} onChanged={onChanged} />,
    );
    expect(screen.queryByTestId('account-password-current')).not.toBeOnTheScreen();
    await user.type(screen.getByTestId('account-password-new'), 'first-secret');
    await user.type(screen.getByTestId('account-password-confirm'), 'first-secret');
    await user.press(screen.getByRole('button', { name: 'Set password' }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(mockAuth.signInWithPassword).not.toHaveBeenCalled();
    expect(mockAuth.updateUser).toHaveBeenCalledWith({
      password: 'first-secret',
      data: { password_set: true },
    });
  });

  it('keeps the button off until every field is filled, then checks the fields match', async () => {
    const user = userEvent.setup();
    await renderWithTheme(
      <ChangePasswordForm email="sam@example.com" hasPassword onChanged={jest.fn()} />,
    );
    expect(screen.getByTestId('account-password-submit')).toBeDisabled();
    await user.type(screen.getByTestId('account-password-current'), 'old-secret');
    await user.type(screen.getByTestId('account-password-new'), 'new-secret-1');
    await user.type(screen.getByTestId('account-password-confirm'), 'new-secret-2');
    await user.press(screen.getByTestId('account-password-submit'));

    expect(screen.getByText('The two passwords do not match.')).toBeOnTheScreen();
    expect(mockAuth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('says so when the current password is wrong', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { code: 'invalid_credentials' },
    });
    const user = userEvent.setup();
    await renderWithTheme(
      <ChangePasswordForm email="sam@example.com" hasPassword onChanged={jest.fn()} />,
    );
    await user.type(screen.getByTestId('account-password-current'), 'guess');
    await user.type(screen.getByTestId('account-password-new'), 'new-secret-1');
    await user.type(screen.getByTestId('account-password-confirm'), 'new-secret-1');
    await user.press(screen.getByTestId('account-password-submit'));

    expect(await screen.findByText('Your current password is not correct.')).toBeOnTheScreen();
    expect(mockAuth.updateUser).not.toHaveBeenCalled();
  });
});
