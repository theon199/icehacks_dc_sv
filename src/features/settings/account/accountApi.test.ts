import { useSessionStore } from '@/features/auth';
// The auth feature exports this class as a type only; the test needs a real instance.
import { AccountError as AuthAccountError } from '@/features/auth/accountApi';

import {
  AccountError,
  changeEmail,
  changePassword,
  deleteAccount,
  fetchAccountUser,
  PUSH_UNREGISTER_TIMEOUT_MS,
  signOutEverywhere,
  signOutLocally,
} from './accountApi';

jest.mock('expo-linking', () => ({ createURL: (path: string) => `famara://${path}` }));

const mockAuth = {
  getUser: jest.fn(),
  updateUser: jest.fn(),
  signInWithPassword: jest.fn(),
  signOut: jest.fn(),
  getSession: jest.fn(),
};
jest.mock('@/lib/supabase/client', () => ({ getSupabase: () => ({ auth: mockAuth }) }));

const mockUnregisterPush = jest.fn((): Promise<void> => Promise.resolve());
const mockEndSession = jest.fn((_scope: string): Promise<unknown> => Promise.resolve(false));
const mockDeleteAccount = jest.fn((_userId: string): Promise<void> => Promise.resolve());
jest.mock('../deps', () => ({
  deleteSignedInAccount: (userId: string) => mockDeleteAccount(userId),
  unregisterPushDevice: () => mockUnregisterPush(),
  endAuthSession: (scope: string) => mockEndSession(scope),
}));

const mockMigrate = jest.fn((_userId: string): Promise<string> => Promise.resolve('nothing'));
const mockDiscard = jest.fn((_userId: string): Promise<void> => Promise.resolve());
jest.mock('../legacySettings', () => ({
  migrateLegacySettings: (userId: string) => mockMigrate(userId),
  discardLegacyAccount: (userId: string) => mockDiscard(userId),
}));

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
    expect(mockAuth.updateUser).toHaveBeenCalledWith({
      password: 'long-enough',
      data: { password_set: true },
    });
  });
});

describe('password detection', () => {
  const appleUser = (metadata: Record<string, unknown>) => ({
    data: {
      user: {
        id: 'u2',
        email: 'kai@example.com',
        app_metadata: { provider: 'apple', providers: ['apple'] },
        user_metadata: metadata,
      },
    },
    error: null,
  });

  it('treats an Apple account that has set a password as having one', async () => {
    // Auth keeps listing only the Apple identity after a password is added.
    mockAuth.getUser.mockResolvedValue(appleUser({ password_set: true }));
    expect((await fetchAccountUser()).hasPassword).toBe(true);
    mockAuth.getUser.mockResolvedValue(appleUser({}));
    expect((await fetchAccountUser()).hasPassword).toBe(false);
  });

  it('sees email sign-ups as having a password', async () => {
    mockAuth.getUser.mockResolvedValue({
      data: { user: { id: 'u3', email: 'a@b.co', app_metadata: { providers: ['email'] } } },
      error: null,
    });
    expect((await fetchAccountUser()).hasPassword).toBe(true);
  });
});

describe('signOutLocally', () => {
  let stored = true;

  beforeEach(() => {
    jest.clearAllMocks();
    stored = true;
    mockAuth.getSession.mockImplementation(async () => ({
      data: { session: stored ? { access_token: 't' } : null },
      error: null,
    }));
    mockUnregisterPush.mockResolvedValue(undefined);
    useSessionStore.getState().signedIn({
      userId: 'user-1',
      birthYear: 1990,
      onboardingComplete: true,
      aiConsent: false,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('ends the session through the auth feature and reports success once it is gone', async () => {
    mockEndSession.mockImplementation(async () => {
      stored = false;
    });
    await signOutLocally();
    expect(mockEndSession).toHaveBeenCalledTimes(1);
    expect(mockEndSession).toHaveBeenCalledWith('local');
    expect(mockAuth.signOut).not.toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe('signedOut');
  });

  it('falls back to a local sign-out when the session survives', async () => {
    mockEndSession.mockResolvedValue(undefined);
    mockAuth.signOut.mockImplementation(async () => {
      stored = false;
      return { error: null };
    });
    await signOutLocally();
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(useSessionStore.getState().status).toBe('signedOut');
  });

  it('treats a thrown failure like a reported one', async () => {
    mockEndSession.mockRejectedValue(new Error('offline'));
    mockAuth.signOut.mockImplementation(async () => {
      stored = false;
      return { error: new Error('Network request failed') };
    });
    await signOutLocally();
    expect(useSessionStore.getState().status).toBe('signedOut');
  });

  it('stays signed in and says so when the stored session could not be removed', async () => {
    mockEndSession.mockResolvedValue(undefined);
    mockAuth.signOut.mockResolvedValue({ error: new Error('Network request failed') });
    await expect(signOutLocally()).rejects.toMatchObject({ code: 'sign_out_failed' });
    expect(useSessionStore.getState().status).toBe('ready');
  });

  it('unregisters push and moves old answers while the session is still valid', async () => {
    const order: string[] = [];
    mockUnregisterPush.mockImplementation(async () => {
      order.push('unregister');
    });
    mockMigrate.mockImplementation(async () => {
      order.push('migrate');
      return 'notReady';
    });
    mockEndSession.mockImplementation(async () => {
      order.push('signOut');
      stored = false;
    });
    await signOutLocally();
    expect(order).toEqual(['unregister', 'migrate', 'signOut']);
    expect(mockMigrate).toHaveBeenCalledWith('user-1');
    // An account whose old answers could not be moved keeps them for its next sign-in.
    expect(mockDiscard).not.toHaveBeenCalled();
  });

  it('signs out of every device and reports whether they were reached', async () => {
    mockEndSession.mockImplementation(async () => {
      stored = false;
      return true;
    });
    await expect(signOutEverywhere()).resolves.toEqual({ everywhere: true });
    expect(mockEndSession).toHaveBeenCalledWith('global');
  });

  it('does not wait on an unreachable push service', async () => {
    jest.useFakeTimers();
    mockUnregisterPush.mockImplementation(() => new Promise<void>(() => undefined));
    mockEndSession.mockImplementation(async () => {
      stored = false;
    });
    const done = signOutLocally();
    await jest.advanceTimersByTimeAsync(PUSH_UNREGISTER_TIMEOUT_MS);
    await done;
    expect(useSessionStore.getState().status).toBe('signedOut');
  });
});

describe('deleteAccount', () => {
  let stored = true;

  beforeEach(() => {
    jest.clearAllMocks();
    stored = true;
    mockAuth.getSession.mockImplementation(async () => ({
      data: { session: stored ? { access_token: 't' } : null },
      error: null,
    }));
    mockAuth.signOut.mockImplementation(async () => {
      stored = false;
      return { error: null };
    });
    useSessionStore.getState().signedIn({
      userId: 'user-1',
      birthYear: 1990,
      onboardingComplete: true,
      aiConsent: false,
    });
  });

  it('signs out once the account is deleted, even if clearing this device fails', async () => {
    mockDeleteAccount.mockRejectedValueOnce(new Error('could not reset a store'));
    await deleteAccount();
    expect(mockDeleteAccount).toHaveBeenCalledWith('user-1');
    expect(mockDiscard).toHaveBeenCalledWith('user-1');
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(useSessionStore.getState().status).toBe('signedOut');
  });

  it('stays signed in and explains when the server did not delete the account', async () => {
    mockDeleteAccount.mockRejectedValueOnce(new AuthAccountError('offline', 'offline'));
    await expect(deleteAccount()).rejects.toMatchObject({ code: 'offline' });
    expect(mockAuth.signOut).not.toHaveBeenCalled();
    expect(mockDiscard).not.toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe('ready');
  });
});
