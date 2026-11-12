import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';

import { queryClient } from '@/lib/query/client';
import { storageKey } from '@/lib/storage/kv';
import { FakeSyncServer } from '@/lib/sync/__fixtures__/fakeServer';
import { accountDeletedCleanup, startSync, stopSync } from '@/lib/sync/session';
import { useSyncStatusStore } from '@/lib/sync/status';
import {
  defaultPreferences,
  selectAiConsentHint,
  useChefStore,
  useMealPlanStore,
  usePantryStore,
  usePersonalDetailsStore,
  usePreferencesStore,
  useSavedStore,
  useSettingsStore,
} from '@/stores';

import { signOut } from './authActions';
import { usePendingEmail } from './pendingEmail';
import { readCachedSetup } from './profileCache';
import { useSessionStore } from './sessionStore';
import { useSessionBootstrap } from './useSessionBootstrap';

type AuthListener = (event: string, session: { user: { id: string } } | null) => void;

const mockAuth = {
  listener: null as AuthListener | null,
  getSession: jest.fn(),
  getUser: jest.fn(),
  signOut: jest.fn(async (_options?: unknown) => ({ error: null })),
  unsubscribe: jest.fn(),
  rpc: jest.fn(),
};

jest.mock('@/lib/env', () => ({ readPublicEnv: () => ({ ok: true }) }));
jest.mock('@/lib/supabase/client', () => ({
  getSupabase: () => ({
    rpc: mockAuth.rpc,
    auth: {
      getSession: mockAuth.getSession,
      getUser: mockAuth.getUser,
      signOut: mockAuth.signOut,
      onAuthStateChange: (listener: AuthListener) => {
        mockAuth.listener = listener;
        return { data: { subscription: { unsubscribe: mockAuth.unsubscribe } } };
      },
    },
  }),
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => (jest.requireActual('crypto') as { randomUUID: () => string }).randomUUID(),
}));

/** One fake server per account, as the real one only ever serves the signed-in account's rows. */
let mockServers = new Map<string, FakeSyncServer>();
function mockServerFor(userId: string): FakeSyncServer {
  let server = mockServers.get(userId);
  if (!server) {
    server = new FakeSyncServer();
    mockServers.set(userId, server);
  }
  return server;
}
jest.mock('@/lib/sync/transport', () => ({
  createSupabaseTransport: jest.fn((userId: string) => mockServerFor(userId).transport()),
}));

const thisYear = new Date().getFullYear();
const initial = useSessionStore.getState();
const OWNER_KEY = storageKey('sync.owner');

function serverAge(ageYears: number | null, userId = 'user-1') {
  return {
    data: {
      user_id: userId,
      handle: 'cook_1',
      has_birth_year: ageYears != null,
      age_years: ageYears,
      is_adult: ageYears != null && ageYears >= 18,
      is_underage: ageYears != null && ageYears < 13,
      suspended_until: null,
      roles: [],
    },
    error: null,
  };
}

const signedIn = (id: string) => ({ data: { session: { user: { id } } } });

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Answers onboarding the way the questionnaire does. */
function finishOnboarding(allergens: readonly ('peanut' | 'sesame')[] = []) {
  const prefs = usePreferencesStore.getState();
  prefs.update({ displayName: 'Sam', householdSize: 2 });
  prefs.setAllergens(allergens);
  prefs.completeOnboarding();
}

/** Some of everything a signed-in person accumulates on the device. */
function fillUserStores() {
  usePantryStore.getState().add({ name: 'basmati rice', category: 'grain' });
  useSavedStore.getState().save('recipe-1');
  useMealPlanStore
    .getState()
    .setSlot('2026-11-09', '0-dinner', { recipeId: 'recipe-1', servings: 2 });
  useChefStore.getState().startThread('Weeknight ideas');
  usePersonalDetailsStore.getState().update({ heightCm: 170, weightKg: 70 });
}

const sessionRefused = { data: null, error: { code: 'PGRST301', message: 'JWT expired' } };

beforeEach(async () => {
  await accountDeletedCleanup();
  Storage.clearSync();
  mockServers = new Map();
  usePendingEmail.getState().clear();
  useSessionStore.setState(initial, true);
  mockAuth.listener = null;
  mockAuth.rpc.mockResolvedValue(serverAge(null));
  mockAuth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
});

afterAll(() => stopSync());

describe('useSessionBootstrap', () => {
  it('moves to signedOut when there is no stored session', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null } });
    await renderHook(() => useSessionBootstrap());
    expect(useSessionStore.getState().status).toBe('signedOut');
  });

  it('sends a new account to setup without syncing before the age gate', async () => {
    mockAuth.getSession.mockResolvedValue(signedIn('user-1'));
    await renderHook(() => useSessionBootstrap());
    await flush();
    expect(useSessionStore.getState()).toMatchObject({
      status: 'needsSetup',
      userId: 'user-1',
      birthYear: null,
    });
    expect(mockAuth.rpc).toHaveBeenCalledWith('my_account_status');
    expect(Storage.getItemSync(OWNER_KEY)).toBeNull();
  });

  it('takes the birth year from the server and remembers it as a launch hint', async () => {
    mockAuth.getSession.mockResolvedValue(signedIn('user-1'));
    mockAuth.rpc.mockResolvedValue(serverAge(30));
    await renderHook(() => useSessionBootstrap());
    await flush();
    expect(useSessionStore.getState().birthYear).toBe(thisYear - 31);
    expect(readCachedSetup('user-1').birthYear).toBe(thisYear - 31);
  });

  it('keeps the launch hint when the server cannot be reached', async () => {
    mockAuth.getSession.mockResolvedValue(signedIn('user-1'));
    mockAuth.rpc.mockResolvedValue(serverAge(30));
    const first = await renderHook(() => useSessionBootstrap());
    await flush();
    await first.unmount();

    useSessionStore.setState(initial, true);
    mockAuth.rpc.mockResolvedValue({ data: null, error: { message: 'Network request failed' } });
    await renderHook(() => useSessionBootstrap());
    await flush();
    expect(useSessionStore.getState().birthYear).toBe(thisYear - 31);
  });

  it('starts sync past the age gate and reaches ready when onboarding completes', async () => {
    mockAuth.getSession.mockResolvedValue(signedIn('user-1'));
    mockAuth.rpc.mockResolvedValue(serverAge(30));
    await renderHook(() => useSessionBootstrap());
    await flush();
    expect(useSessionStore.getState().status).toBe('needsSetup');
    await waitFor(() => expect(Storage.getItemSync(OWNER_KEY)).toBe('user-1'));

    await act(async () => finishOnboarding());
    expect(useSessionStore.getState().status).toBe('ready');
  });

  it('skips onboarding for a returning person once their answers sync in', async () => {
    mockServerFor('user-1').seed({
      collection: 'preferences',
      doc_id: 'main',
      data: {
        ...defaultPreferences,
        allergens: ['sesame'],
        allergensAnswered: true,
        onboardedAt: '2026-10-01T10:00:00.000Z',
      },
      updated_at: '2026-10-01T10:00:00.000Z',
      device_id: 'other-device',
      deleted_at: null,
    });
    mockAuth.getSession.mockResolvedValue(signedIn('user-1'));
    mockAuth.rpc.mockResolvedValue(serverAge(30));
    await renderHook(() => useSessionBootstrap());

    await waitFor(() => expect(useSessionStore.getState().status).toBe('ready'));
    expect(usePreferencesStore.getState().prefs.allergens).toEqual(['sesame']);
  });

  it('wipes every user store and cached query when the session ends', async () => {
    mockAuth.getSession.mockResolvedValue(signedIn('user-1'));
    mockAuth.rpc.mockResolvedValue(serverAge(30));
    const clearQueries = jest.spyOn(queryClient, 'clear');
    await renderHook(() => useSessionBootstrap());
    await flush();
    await act(async () => {
      finishOnboarding(['peanut']);
      fillUserStores();
    });

    await act(async () => mockAuth.listener?.('SIGNED_OUT', null));
    expect(useSessionStore.getState().status).toBe('signedOut');
    expect(clearQueries).toHaveBeenCalled();
    await waitFor(() => expect(usePantryStore.getState().items).toEqual({}));
    expect(usePreferencesStore.getState().prefs).toEqual(defaultPreferences);
    expect(useSavedStore.getState().saved).toEqual({});
    expect(useMealPlanStore.getState().weeks).toEqual({});
    expect(useChefStore.getState().threads).toEqual({});
    expect(Storage.getItemSync(OWNER_KEY)).toBeNull();
  });

  it('never hands one account’s data to the next person on the device', async () => {
    // Person A used the app, then their session ended while it was closed.
    await startSync('person-a');
    finishOnboarding();
    fillUserStores();
    await stopSync();

    mockAuth.getSession.mockResolvedValue(signedIn('person-b'));
    mockAuth.rpc.mockResolvedValue(serverAge(30, 'person-b'));
    await renderHook(() => useSessionBootstrap());

    await waitFor(() => expect(Storage.getItemSync(OWNER_KEY)).toBe('person-b'));
    await flush();
    expect(useSessionStore.getState()).toMatchObject({
      userId: 'person-b',
      status: 'needsSetup',
      onboardingComplete: false,
    });
    expect(usePreferencesStore.getState().prefs.onboardedAt).toBeNull();
    expect(usePantryStore.getState().items).toEqual({});
    expect(useSavedStore.getState().saved).toEqual({});
  });

  it('does not read the previous account’s answers when someone else signs in', async () => {
    mockAuth.getSession.mockResolvedValue(signedIn('person-a'));
    mockAuth.rpc.mockResolvedValue(serverAge(30, 'person-a'));
    await renderHook(() => useSessionBootstrap());
    await flush();
    await act(async () => {
      finishOnboarding(['peanut']);
      fillUserStores();
    });
    expect(useSessionStore.getState().status).toBe('ready');

    mockAuth.rpc.mockResolvedValue(serverAge(30, 'person-b'));
    await act(async () => mockAuth.listener?.('SIGNED_IN', { user: { id: 'person-b' } }));
    expect(useSessionStore.getState()).toMatchObject({
      userId: 'person-b',
      onboardingComplete: false,
    });

    await waitFor(() => expect(Storage.getItemSync(OWNER_KEY)).toBe('person-b'));
    await flush();
    expect(useSessionStore.getState().onboardingComplete).toBe(false);
    expect(usePreferencesStore.getState().prefs.allergens).toEqual([]);
    expect(usePantryStore.getState().items).toEqual({});
  });

  it('opens AI from the settings store’s consent hint and keeps that hint current', async () => {
    useSettingsStore.getState().rememberAiConsent(true);
    mockAuth.getSession.mockResolvedValue(signedIn('user-1'));
    mockAuth.rpc.mockResolvedValue(serverAge(30));
    await renderHook(() => useSessionBootstrap());
    await flush();
    expect(useSessionStore.getState().aiConsent).toBe(true);

    await act(async () => useSessionStore.getState().setAiConsent(false));
    expect(selectAiConsentHint(useSettingsStore.getState())?.granted).toBe(false);
  });

  it('treats a missing consent hint as not agreed', async () => {
    mockAuth.getSession.mockResolvedValue(signedIn('user-1'));
    mockAuth.rpc.mockResolvedValue(serverAge(30));
    await renderHook(() => useSessionBootstrap());
    await flush();
    expect(useSessionStore.getState().aiConsent).toBe(false);
  });

  it('forgets a pending confirmation address once someone is signed in', async () => {
    usePendingEmail.getState().setPending('sam@example.com');
    mockAuth.getSession.mockResolvedValue(signedIn('user-1'));
    await renderHook(() => useSessionBootstrap());
    await flush();
    expect(usePendingEmail.getState().email).toBeNull();
  });

  it('signs out once the auth server confirms the session is gone', async () => {
    mockAuth.getSession.mockResolvedValue(signedIn('user-1'));
    mockAuth.rpc.mockResolvedValue(sessionRefused);
    mockAuth.getUser.mockResolvedValue({
      data: { user: null },
      error: { status: 401, message: 'invalid JWT' },
    });
    await renderHook(() => useSessionBootstrap());
    await waitFor(() => expect(mockAuth.signOut).toHaveBeenCalled());
  });

  it('stays signed in when a single refusal is not confirmed', async () => {
    mockAuth.getSession.mockResolvedValue(signedIn('user-1'));
    mockAuth.rpc.mockResolvedValue(sessionRefused);
    await renderHook(() => useSessionBootstrap());
    await flush();
    expect(mockAuth.getUser).toHaveBeenCalled();
    expect(mockAuth.signOut).not.toHaveBeenCalled();
    expect(useSessionStore.getState().userId).toBe('user-1');
  });

  it('ignores a refusal that belongs to an account already replaced', async () => {
    let answerFirstCheck: (value: typeof sessionRefused) => void = () => undefined;
    mockAuth.getSession.mockResolvedValue(signedIn('person-a'));
    mockAuth.rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answerFirstCheck = resolve;
        }),
    );
    mockAuth.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    await renderHook(() => useSessionBootstrap());
    await flush();

    mockAuth.rpc.mockResolvedValue(serverAge(30, 'person-b'));
    await act(async () => mockAuth.listener?.('SIGNED_IN', { user: { id: 'person-b' } }));
    await act(async () => answerFirstCheck(sessionRefused));
    await flush();

    expect(useSessionStore.getState().userId).toBe('person-b');
    expect(mockAuth.signOut).not.toHaveBeenCalled();
  });

  it('falls back to signedOut when restoring fails', async () => {
    mockAuth.getSession.mockRejectedValue(new Error('keychain locked'));
    const { unmount } = await renderHook(() => useSessionBootstrap());
    expect(useSessionStore.getState().status).toBe('signedOut');
    await unmount();
    expect(mockAuth.unsubscribe).toHaveBeenCalled();
  });
});

describe('signOut', () => {
  it('clears pantry, saved items, plan, chef threads and personal details before the session goes', async () => {
    mockAuth.getSession.mockResolvedValue(signedIn('user-1'));
    mockAuth.rpc.mockResolvedValue(serverAge(30));
    await renderHook(() => useSessionBootstrap());
    await waitFor(() => expect(Storage.getItemSync(OWNER_KEY)).toBe('user-1'));
    // Sync has finished its first round, so the edits below are pending pushes.
    await waitFor(() => expect(useSyncStatusStore.getState().phase).toBe('idle'));
    await act(async () => {
      finishOnboarding(['sesame']);
      fillUserStores();
    });
    await waitFor(async () =>
      expect(await SecureStore.getItemAsync('famara.user.personal_details')).not.toBeNull(),
    );

    let pantryWhenSessionWent: unknown = 'not signed out';
    mockAuth.signOut.mockImplementationOnce(async () => {
      pantryWhenSessionWent = usePantryStore.getState().items;
      return { error: null };
    });
    await act(async () => signOut());

    expect(pantryWhenSessionWent).toEqual({});
    expect(usePantryStore.getState().items).toEqual({});
    expect(useSavedStore.getState().saved).toEqual({});
    expect(useMealPlanStore.getState().weeks).toEqual({});
    expect(useChefStore.getState().threads).toEqual({});
    expect(usePersonalDetailsStore.getState().details.heightCm).toBeNull();
    expect(usePreferencesStore.getState().prefs).toEqual(defaultPreferences);
    await waitFor(async () =>
      expect(await SecureStore.getItemAsync('famara.user.personal_details')).toBeNull(),
    );
    expect(Storage.getItemSync(storageKey('user.pantry'))).toBeNull();
    expect(Storage.getItemSync(OWNER_KEY)).toBeNull();
    // What was pending reached the account before the wipe.
    expect(
      [...mockServerFor('user-1').rows.values()].some((row) => row.collection === 'pantry'),
    ).toBe(true);
  });
});
