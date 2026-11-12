import { useSessionStore } from '@/features/auth';

import {
  AccountError,
  changeEmail,
  changePassword,
  fetchAccountUser,
  PUSH_UNREGISTER_TIMEOUT_MS,
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
jest.mock('../deps', () => ({
  clearLocalUserData: jest.fn(),
  unregisterPushDevice: () => mockUnregisterPush(),
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
  /** A stored session that disappears once `signOut` manages to remove it. */
  function storedSession(removedOnCall: number | null) {
    let stored = true;
    let calls = 0;
    mockAuth.getSession.mockImplementation(async () => ({
      data: { session: stored ? { access_token: 't' } : null },
      error: null,
    }));
    return (result: unknown) => async () => {
      calls += 1;
      if (removedOnCall != null && calls >= removedOnCall) stored = false;
      if (result instanceof Error) throw result;
      return result;
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
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

  it('revokes this device only and reports success once the session is gone', async () => {
    const respond = storedSession(1);
    mockAuth.signOut.mockImplementation(respond({ error: null }));
    await signOutLocally();
    expect(mockAuth.signOut).toHaveBeenCalledTimes(1);
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(useSessionStore.getState().status).toBe('signedOut');
  });

  it('falls back to a local sign-out when revocation reports an error', async () => {
    const respond = storedSession(2);
    mockAuth.signOut
      .mockImplementationOnce(respond({ error: new Error('Network request failed') }))
      .mockImplementationOnce(respond({ error: null }));
    await signOutLocally();
    expect(mockAuth.signOut).toHaveBeenCalledTimes(2);
    expect(mockAuth.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
    expect(useSessionStore.getState().status).toBe('signedOut');
  });

  it('treats a thrown failure like a reported one', async () => {
    const respond = storedSession(2);
    mockAuth.signOut
      .mockImplementationOnce(respond(new Error('offline')))
      .mockImplementationOnce(respond({ error: null }));
    await signOutLocally();
    expect(useSessionStore.getState().status).toBe('signedOut');
  });

  it('stays signed in and says so when the stored session could not be removed', async () => {
    const respond = storedSession(null);
    mockAuth.signOut.mockImplementation(respond({ error: new Error('Network request failed') }));
    await expect(signOutLocally()).rejects.toMatchObject({ code: 'sign_out_failed' });
    expect(useSessionStore.getState().status).toBe('ready');
  });

  it('unregisters push while the session is still valid', async () => {
    const order: string[] = [];
    mockUnregisterPush.mockImplementation(async () => {
      order.push('unregister');
    });
    const respond = storedSession(1);
    mockAuth.signOut.mockImplementation(async () => {
      order.push('signOut');
      return respond({ error: null })();
    });
    await signOutLocally();
    expect(order).toEqual(['unregister', 'signOut']);
  });

  it('does not wait on an unreachable push service', async () => {
    jest.useFakeTimers();
    mockUnregisterPush.mockImplementation(() => new Promise<void>(() => undefined));
    const respond = storedSession(1);
    mockAuth.signOut.mockImplementation(respond({ error: null }));
    const done = signOutLocally();
    await jest.advanceTimersByTimeAsync(PUSH_UNREGISTER_TIMEOUT_MS);
    await done;
    expect(useSessionStore.getState().status).toBe('signedOut');
  });
});
