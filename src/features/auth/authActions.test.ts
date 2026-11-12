import { completeCallback, requestPasswordReset, sessionRejectedByServer } from './authActions';
import { AUTH_CALLBACK_URL, callbackLinkId } from './callback';

const mockAuthClient = {
  resetPasswordForEmail: jest.fn(),
  exchangeCodeForSession: jest.fn(),
  getUser: jest.fn(),
};

jest.mock('@/lib/supabase/client', () => ({ getSupabase: () => ({ auth: mockAuthClient }) }));

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
