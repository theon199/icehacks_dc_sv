import { usePantryStore, useSettingsStore } from '@/stores';

import { deleteMyAccount, identityFor, isAccountError } from './accountApi';
import { readCachedSetup, writeCachedSetup } from './profileCache';
import { useSessionStore } from './sessionStore';

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

const initialSession = useSessionStore.getState();

jest.mock('expo-crypto', () => ({
  randomUUID: () => (jest.requireActual('crypto') as { randomUUID: () => string }).randomUUID(),
}));

beforeEach(() => {
  useSessionStore.setState(initialSession, true);
  usePantryStore.getState().reset();
  useSettingsStore.getState().reset();
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
  it('wipes the deleted account’s data from this device', async () => {
    useSessionStore
      .getState()
      .signedIn({ userId: 'kid-1', birthYear: 2016, onboardingComplete: false });
    writeCachedSetup('kid-1', { birthYear: 2016 });
    usePantryStore.getState().add({ name: 'rice' });
    useSettingsStore.getState().rememberAiConsent(true);
    expect(Object.keys(usePantryStore.getState().items)).toHaveLength(1);

    await deleteMyAccount({ userId: 'kid-1', accessToken: 'jwt-kid-1' });

    expect(mockClient.rpc).toHaveBeenCalledWith('delete_my_account', undefined);
    expect(readCachedSetup('kid-1').birthYear).toBeNull();
    expect(usePantryStore.getState().items).toEqual({});
    expect(useSettingsStore.getState().aiConsentHint).toBeNull();
  });

  it('runs as the given account and leaves whoever signed in since alone', async () => {
    writeCachedSetup('kid-1', { birthYear: 2016 });
    // Another account has signed in since the identity was captured.
    mockClient.sessionUser = 'someone-else';
    useSessionStore
      .getState()
      .signedIn({ userId: 'someone-else', birthYear: 1990, onboardingComplete: true });
    usePantryStore.getState().add({ name: 'their rice' });

    await deleteMyAccount({ userId: 'kid-1', accessToken: 'jwt-kid-1' });

    expect(mockClient.headers).toEqual([['Authorization', 'Bearer jwt-kid-1']]);
    expect(readCachedSetup('kid-1').birthYear).toBeNull();
    expect(Object.values(usePantryStore.getState().items).map((item) => item.name)).toEqual([
      'their rice',
    ]);
  });
});
