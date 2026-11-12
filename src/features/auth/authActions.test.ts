import {
  completeCallback,
  requestPasswordReset,
  sessionRejectedByServer,
  signOut,
} from './authActions';
import { AUTH_CALLBACK_URL, callbackLinkId } from './callback';

const mockAuthClient = {
  resetPasswordForEmail: jest.fn(),
  exchangeCodeForSession: jest.fn(),
  getUser: jest.fn(),
  signOut: jest.fn(),
};

jest.mock('@/lib/supabase/client', () => ({ getSupabase: () => ({ auth: mockAuthClient }) }));

/** Order of the sign-out steps, as the mocks below record them. */
const steps: string[] = [];
const mockSignOutCleanup = jest.fn(async () => {
  steps.push('cleanup');
});
jest.mock('./deps', () => ({ signOutCleanup: () => mockSignOutCleanup() }));

describe('signOut', () => {
  beforeEach(() => {
    steps.length = 0;
    mockAuthClient.signOut.mockImplementation(async (options: { scope: string }) => {
      steps.push(options.scope);
      return { error: null };
    });
  });

  it('ends only this device’s session by default, after wiping local data', async () => {
    await expect(signOut()).resolves.toEqual({ everywhere: false });
    expect(steps).toEqual(['cleanup', 'local']);
  });

  it('signs out every device when asked, and says so', async () => {
    await expect(signOut({ scope: 'global' })).resolves.toEqual({ everywhere: true });
    expect(steps).toEqual(['cleanup', 'global']);
  });

  it('falls back to this device when the global sign-out reports an error', async () => {
    mockAuthClient.signOut.mockImplementation(async (options: { scope: string }) => {
      steps.push(options.scope);
      return { error: options.scope === 'global' ? new Error('offline') : null };
    });
    await expect(signOut({ scope: 'global' })).resolves.toEqual({ everywhere: false });
    expect(steps).toEqual(['cleanup', 'global', 'local']);
  });

  it('falls back to this device when the global sign-out throws', async () => {
    mockAuthClient.signOut.mockImplementation(async (options: { scope: string }) => {
      steps.push(options.scope);
      if (options.scope === 'global') throw new Error('Network request failed');
      return { error: null };
    });
    await expect(signOut({ scope: 'global' })).resolves.toEqual({ everywhere: false });
    expect(steps).toEqual(['cleanup', 'global', 'local']);
  });

  it('still ends the session when the local cleanup fails', async () => {
    mockSignOutCleanup.mockRejectedValueOnce(new Error('disk full'));
    await expect(signOut()).resolves.toEqual({ everywhere: false });
    expect(steps).toEqual(['local']);
  });
});

describe('password recovery', () => {
  it('returns to the exact allow-listed callback address', async () => {
    mockAuthClient.resetPasswordForEmail.mockResolvedValue({ error: null });
    await expect(requestPasswordReset(' Pat@Example.com ')).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(mockAuthClient.resetPasswordForEmail).toHaveBeenCalledWith('pat@example.com', {
      redirectTo: AUTH_CALLBACK_URL,
    });
    expect(AUTH_CALLBACK_URL).not.toContain('?');
  });

  it('recognises a recovery code from the flow the auth library stored', async () => {
    mockAuthClient.exchangeCodeForSession.mockResolvedValue({
      data: { session: {}, user: {}, redirectType: 'recovery' },
      error: null,
    });
    const outcome = await completeCallback({
      kind: 'exchange',
      code: 'c-1',
      flowId: null,
      recovery: false,
    });
    expect(outcome).toEqual({ ok: true, value: { recovery: true } });
  });

  it('treats an ordinary confirmation code as a sign-in', async () => {
    mockAuthClient.exchangeCodeForSession.mockResolvedValue({
      data: { session: {}, user: {}, redirectType: null },
      error: null,
    });
    const outcome = await completeCallback({
      kind: 'exchange',
      code: 'c-2',
      flowId: null,
      recovery: false,
    });
    expect(outcome).toEqual({ ok: true, value: { recovery: false } });
  });
});

describe('sessionRejectedByServer', () => {
  it('is true only when the auth server refuses the session', async () => {
    mockAuthClient.getUser.mockResolvedValueOnce({ data: { user: null }, error: { status: 401 } });
    await expect(sessionRejectedByServer()).resolves.toBe(true);

    mockAuthClient.getUser.mockResolvedValueOnce({ data: { user: { id: 'u' } }, error: null });
    await expect(sessionRejectedByServer()).resolves.toBe(false);

    mockAuthClient.getUser.mockResolvedValueOnce({ data: { user: null }, error: { status: 0 } });
    await expect(sessionRejectedByServer()).resolves.toBe(false);

    mockAuthClient.getUser.mockRejectedValueOnce(new Error('Network request failed'));
    await expect(sessionRejectedByServer()).resolves.toBe(false);
  });
});

describe('callbackLinkId', () => {
  it('is the same for repeat deliveries and differs for a new link', () => {
    const first = callbackLinkId({ code: 'a', sb_flow_id: 'f' });
    expect(callbackLinkId({ code: 'a', sb_flow_id: 'f' })).toBe(first);
    expect(callbackLinkId({ code: 'b' })).not.toBe(first);
    expect(callbackLinkId({ error_code: 'otp_expired' })).not.toBe(callbackLinkId({}));
  });
});
