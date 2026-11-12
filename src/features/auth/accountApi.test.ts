import { deleteMyAccount, identityFor, isAccountError } from './accountApi';
import { aiConsent } from './deps';
import { readCachedSetup, writeCachedSetup } from './profileCache';

const mockClient = {
  sessionUser: 'kid-1' as string | null,
  headers: [] as [string, string][],
  rpc: jest.fn(),
};

jest.mock('@/lib/supabase/client', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({
        data: {
          session: mockClient.sessionUser
            ? {
                user: { id: mockClient.sessionUser },
                access_token: `jwt-${mockClient.sessionUser}`,
              }
            : null,
        },
      }),
    },
    rpc: (name: string, args?: unknown) => {
      const reply = Promise.resolve(mockClient.rpc(name, args));
      return Object.assign(reply, {
        setHeader(header: string, value: string) {
          mockClient.headers.push([header, value]);
          return reply;
        },
      });
    },
  }),
}));

beforeEach(() => {
  mockClient.sessionUser = 'kid-1';
  mockClient.headers = [];
  mockClient.rpc.mockReturnValue({ data: { deleted: true }, error: null });
});

describe('identityFor', () => {
  it('captures the token of the account that is signed in', async () => {
    await expect(identityFor('kid-1')).resolves.toEqual({
      userId: 'kid-1',
      accessToken: 'jwt-kid-1',
    });
  });

  it('refuses when a different account is signed in now', async () => {
    mockClient.sessionUser = 'someone-else';
    const failure: unknown = await identityFor('kid-1').catch((error: unknown) => error);
    expect(isAccountError(failure) && failure.kind).toBe('account_changed');
  });
});

describe('deleteMyAccount', () => {
  it('runs as the given account and forgets its hints on this device', async () => {
    writeCachedSetup('kid-1', { birthYear: 2016 });
    aiConsent.write('kid-1', true);
    // Another account has signed in since the identity was captured.
    mockClient.sessionUser = 'someone-else';

    await deleteMyAccount({ userId: 'kid-1', accessToken: 'jwt-kid-1' });

    expect(mockClient.rpc).toHaveBeenCalledWith('delete_my_account', undefined);
    expect(mockClient.headers).toEqual([['Authorization', 'Bearer jwt-kid-1']]);
    expect(readCachedSetup('kid-1').birthYear).toBeNull();
    expect(aiConsent.read('kid-1')).toBe(false);
  });
});
