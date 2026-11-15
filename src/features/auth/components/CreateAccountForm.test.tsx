import { fireEvent, screen, userEvent } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/render';

import { signUpWithEmail } from '../authActions';
import { authFailure } from '../authErrors';
import { usePendingEmail } from '../pendingEmail';
import { CreateAccountForm } from './CreateAccountForm';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('../authActions', () => ({ signUpWithEmail: jest.fn() }));

const signUp = jest.mocked(signUpWithEmail);

async function fill(email: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText('Email'), email);
  await fireEvent.changeText(screen.getByLabelText('Password'), password);
}

describe('CreateAccountForm', () => {
  it('requires 8 characters and agreement to the terms', async () => {
    await renderWithTheme(<CreateAccountForm />);
    await fill('new@example.com', 'short');
    await userEvent.setup().press(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Use at least 8 characters.')).toBeOnTheScreen();
    expect(
      screen.getByText('Please agree to the Terms and Privacy Policy to continue.'),
    ).toBeOnTheScreen();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('moves to the confirmation-pending state after sign-up', async () => {
    signUp.mockResolvedValue({ ok: true, value: { needsConfirmation: true } });
    await renderWithTheme(<CreateAccountForm />);
    await fill('New@Example.com', 'long enough');
    const user = userEvent.setup();
    await user.press(
      screen.getByRole('checkbox', { name: 'I agree to the Terms and Privacy Policy' }),
    );
    await user.press(screen.getByRole('button', { name: 'Create account' }));
    expect(signUp).toHaveBeenCalledWith('New@Example.com', 'long enough');
    expect(usePendingEmail.getState().email).toBe('new@example.com');
    expect(mockRouter.push).toHaveBeenCalledWith('/check-email');
  });

  it('goes straight on without a confirmation step when sign-up returns a session', async () => {
    mockRouter.push.mockClear();
    signUp.mockResolvedValue({ ok: true, value: { needsConfirmation: false } });
    await renderWithTheme(<CreateAccountForm />);
    await fill('new@example.com', 'long enough');
    const user = userEvent.setup();
    await user.press(
      screen.getByRole('checkbox', { name: 'I agree to the Terms and Privacy Policy' }),
    );
    await user.press(screen.getByRole('button', { name: 'Create account' }));
    expect(signUp).toHaveBeenCalledWith('new@example.com', 'long enough');
    // The session guard moves the person on to setup; nothing waits on an email.
    expect(mockRouter.push).not.toHaveBeenCalledWith('/check-email');
  });

  it('shows rate limiting from the server', async () => {
    signUp.mockResolvedValue({ ok: false, failure: authFailure('rate_limited') });
    await renderWithTheme(<CreateAccountForm />);
    await fill('new@example.com', 'long enough');
    const user = userEvent.setup();
    await user.press(screen.getByRole('checkbox', { name: /I agree/ }));
    await user.press(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText(/Too many attempts/)).toBeOnTheScreen();
  });
});
