import { AccountError, changeEmail, changePassword, fetchAccountUser } from './accountApi';

jest.mock('expo-linking', () => ({ createURL: (path: string) => `famara://${path}` }));

const mockAuth = {
  getUser: jest.fn(),
  updateUser: jest.fn(),
  signInWithPassword: jest.fn(),
};
jest.mock('@/lib/supabase/client', () => ({ getSupabase: () => ({ auth: mockAuth }) }));

describe('fetchAccountUser', () => {
  it('reports whether the account signs in with a password', async () => {
    mockAuth.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'u1',
          email: 'sam@example.com',
          new_email: 'sam@new.example.com',
          app_metadata: { provider: 'apple', providers: ['apple'] },
        },
      },
      error: null,
    });
    expect(await fetchAccountUser()).toEqual({
      id: 'u1',
      email: 'sam@example.com',
      pendingEmail: 'sam@new.example.com',
      hasPassword: false,
    });
  });
});

describe('changeEmail', () => {
  it('rejects a malformed address without calling the server', async () => {
    await expect(changeEmail('not-an-email')).rejects.toBeInstanceOf(AccountError);
    expect(mockAuth.updateUser).not.toHaveBeenCalled();
  });

  it('asks for confirmation links that come back through the auth callback', async () => {
    mockAuth.updateUser.mockResolvedValue({ data: {}, error: null });
    await changeEmail(' new@example.com ');
    expect(mockAuth.updateUser).toHaveBeenCalledWith(
      { email: 'new@example.com' },
      { emailRedirectTo: 'famara:///auth/callback' },
    );
  });

  it('turns server codes into readable messages', async () => {
    mockAuth.updateUser.mockResolvedValue({ data: {}, error: { code: 'email_exists' } });
    await expect(changeEmail('taken@example.com')).rejects.toThrow(
      'That email is already used by another account.',
    );
  });
});

describe('changePassword', () => {
  it('checks the current password before setting the new one', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    mockAuth.updateUser.mockResolvedValue({ data: {}, error: null });
    await changePassword({
      email: 'sam@example.com',
      currentPassword: 'old-password',
      newPassword: 'new-password-1',
    });
    expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({
      email: 'sam@example.com',
      password: 'old-password',
    });
    expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: 'new-password-1' });
  });

  it('stops when the current password is wrong', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { code: 'invalid_credentials' },
    });
    await expect(
      changePassword({
        email: 'sam@example.com',
        currentPassword: 'nope',
        newPassword: 'long-enough',
      }),
    ).rejects.toThrow('Your current password is not correct.');
    expect(mockAuth.updateUser).not.toHaveBeenCalled();
  });

  it('lets accounts without a password set one, with a minimum length', async () => {
    await expect(
      changePassword({ email: null, currentPassword: null, newPassword: 'short' }),
    ).rejects.toMatchObject({ code: 'weak_password' });
    mockAuth.updateUser.mockResolvedValue({ data: {}, error: null });
    await changePassword({ email: null, currentPassword: null, newPassword: 'long-enough' });
    expect(mockAuth.signInWithPassword).not.toHaveBeenCalled();
    expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: 'long-enough' });
  });
});
