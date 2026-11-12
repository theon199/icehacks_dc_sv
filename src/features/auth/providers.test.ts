import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';

import { appleDisplayName, signInWithApple, signInWithGoogle } from './providers';

const mockAuth = {
  signInWithIdToken: jest.fn(),
  signInWithOAuth: jest.fn(),
  exchangeCodeForSession: jest.fn(),
  getSession: jest.fn(async () => ({ data: { session: null } })),
  getUser: jest.fn(async () => ({ data: { user: { id: 'u1' } } })),
  updateUser: jest.fn(async () => ({ error: null })),
};

jest.mock('@/lib/supabase/client', () => ({
  getSupabase: () => ({
    auth: mockAuth,
    from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
  }),
}));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  getRandomBytes: (size: number) => new Uint8Array(size).fill(171),
  digestStringAsync: async (_algorithm: string, value: string) => `sha256(${value})`,
}));
jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  signInAsync: jest.fn(),
  isAvailableAsync: jest.fn(async () => true),
}));
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
  WebBrowserResultType: { CANCEL: 'cancel', DISMISS: 'dismiss' },
}));

const appleSignIn = jest.mocked(AppleAuthentication.signInAsync);
const openAuthSession = jest.mocked(WebBrowser.openAuthSessionAsync);
const rawNonce = 'ab'.repeat(32);

describe('signInWithApple', () => {
  it('sends Apple the hashed nonce and Supabase the raw one', async () => {
    appleSignIn.mockResolvedValue({
      identityToken: 'apple-jwt',
      fullName: { givenName: 'Lin', familyName: 'Chen' },
    } as AppleAuthentication.AppleAuthenticationCredential);
    mockAuth.signInWithIdToken.mockResolvedValue({ error: null });

    await expect(signInWithApple()).resolves.toEqual({ status: 'signedIn' });
    expect(appleSignIn).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: `sha256(${rawNonce})` }),
    );
    expect(mockAuth.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'apple-jwt',
      nonce: rawNonce,
    });
  });

  it('treats closing the Apple sheet as a quiet cancel', async () => {
    appleSignIn.mockRejectedValue(
      Object.assign(new Error('cancel'), { code: 'ERR_REQUEST_CANCELED' }),
    );
    await expect(signInWithApple()).resolves.toEqual({ status: 'cancelled' });
    expect(mockAuth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('reports a server failure', async () => {
    appleSignIn.mockResolvedValue({
      identityToken: 'apple-jwt',
      fullName: null,
    } as AppleAuthentication.AppleAuthenticationCredential);
    mockAuth.signInWithIdToken.mockResolvedValue({
      error: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' },
    });
    await expect(signInWithApple()).resolves.toMatchObject({
      status: 'failed',
      failure: { kind: 'offline' },
    });
  });

  it('joins the name Apple shares', () => {
    expect(
      appleDisplayName({ givenName: ' Lin ', middleName: null, familyName: 'Chen' } as never),
    ).toBe('Lin Chen');
    expect(appleDisplayName(null)).toBeNull();
  });
});

describe('signInWithGoogle', () => {
  beforeEach(() => {
    mockAuth.signInWithOAuth.mockResolvedValue({
      data: { url: 'https://auth.example/authorize?provider=google' },
      error: null,
    });
  });

  it('exchanges the code from the redirect for a session', async () => {
    openAuthSession.mockResolvedValue({
      type: 'success',
      url: 'famara://auth/callback?code=g-code&sb_flow_id=f1',
    });
    mockAuth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });

    await expect(signInWithGoogle()).resolves.toEqual({ status: 'signedIn' });
    expect(mockAuth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: expect.objectContaining({
        redirectTo: 'famara://auth/callback',
        skipBrowserRedirect: true,
      }),
    });
    expect(openAuthSession).toHaveBeenCalledWith(
      'https://auth.example/authorize?provider=google',
      'famara://auth/callback',
      expect.anything(),
    );
    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith('g-code', { flowId: 'f1' });
  });

  it('treats a dismissed browser as a cancel', async () => {
    openAuthSession.mockResolvedValue({ type: WebBrowser.WebBrowserResultType.CANCEL });
    await expect(signInWithGoogle()).resolves.toEqual({ status: 'cancelled' });
  });

  it('treats a declined consent screen as a cancel', async () => {
    openAuthSession.mockResolvedValue({
      type: 'success',
      url: 'famara://auth/callback?error=access_denied&error_description=denied',
    });
    await expect(signInWithGoogle()).resolves.toEqual({ status: 'cancelled' });
  });

  it('fails clearly when the code cannot be exchanged', async () => {
    openAuthSession.mockResolvedValue({ type: 'success', url: 'famara://auth/callback?code=old' });
    mockAuth.exchangeCodeForSession.mockResolvedValue({
      data: {},
      error: { code: 'flow_state_expired', status: 400, message: 'expired' },
    });
    await expect(signInWithGoogle()).resolves.toMatchObject({
      status: 'failed',
      failure: { kind: 'link_expired' },
    });
  });
});
