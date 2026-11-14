import { fireEvent, screen, userEvent } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/render';

import { signInWithEmail } from '../authActions';
import { authFailure } from '../authErrors';
import { usePendingEmail } from '../pendingEmail';
import { LogInForm } from './LogInForm';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('../authActions', () => ({ signInWithEmail: jest.fn() }));

const signIn = jest.mocked(signInWithEmail);

async function fill(email: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText('Email'), email);
  await fireEvent.changeText(screen.getByLabelText('Password'), password);
}

describe('LogInForm', () => {
  it('validates the email inline and does not call the server', async () => {
    await renderWithTheme(<LogInForm />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'sam@');
    await fireEvent(screen.getByLabelText('Email'), 'blur');
    expect(screen.getByText('That email address doesn’t look right.')).toBeOnTheScreen();

    await userEvent.setup().press(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByText('Enter your password.')).toBeOnTheScreen();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('clears the error once the email is fixed', async () => {
    await renderWithTheme(<LogInForm />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'sam');
    await fireEvent(screen.getByLabelText('Email'), 'blur');
    expect(screen.getByText('That email address doesn’t look right.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Email'), 'sam@example.com');
    expect(screen.queryByText('That email address doesn’t look right.')).toBeNull();
  });

  it('explains a wrong password', async () => {
    signIn.mockResolvedValue({ ok: false, failure: authFailure('invalid_credentials') });
    await renderWithTheme(<LogInForm />);
    await fill('sam@example.com', 'wrong-password');
    await userEvent.setup().press(screen.getByRole('button', { name: 'Log in' }));
    expect(signIn).toHaveBeenCalledWith('sam@example.com', 'wrong-password');
    expect(
      await screen.findByText('That email and password don’t match. Check them and try again.'),
    ).toBeOnTheScreen();
  });

  it('reports being offline', async () => {
    signIn.mockResolvedValue({ ok: false, failure: authFailure('offline') });
    await renderWithTheme(<LogInForm />);
    await fill('sam@example.com', 'whatever1');
    await userEvent.setup().press(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText(/You’re offline/)).toBeOnTheScreen();
  });

  it('offers to resend the link when the email is not confirmed', async () => {
    signIn.mockResolvedValue({ ok: false, failure: authFailure('email_not_confirmed') });
    await renderWithTheme(<LogInForm />);
    await fill(' Sam@Example.com ', 'password1');
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Log in' }));
    await user.press(
      await screen.findByRole('button', { name: 'Send the confirmation link again' }),
    );
    expect(usePendingEmail.getState().email).toBe('sam@example.com');
    expect(mockRouter.push).toHaveBeenCalledWith('/check-email');
  });

  it('opens the reset flow from Forgot password', async () => {
    await renderWithTheme(<LogInForm />);
    await userEvent.setup().press(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/forgot-password');
  });

  it('shows and hides the password', async () => {
    await renderWithTheme(<LogInForm />);
    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', true);
    await userEvent.setup().press(screen.getByRole('switch', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', false);
  });
});
