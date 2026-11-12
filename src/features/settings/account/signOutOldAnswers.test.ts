/**
 * Signing out while sync is offline: the old Settings answers are merged before the session ends,
 * but the push cannot confirm them, so their allergens and diets must survive the wipe and come
 * back on the account's next sign-in here.
 */
import Storage from 'expo-sqlite/kv-store';

import { useSessionStore } from '@/features/auth';
import { useSyncStatusStore } from '@/lib/sync';
import {
  defaultPreferences,
  resetUserStores,
  selectAvoidAllergens,
  usePersonalDetailsStore,
  usePreferencesStore,
  type Preferences,
} from '@/stores';

import type * as DepsModule from '../deps';
import { migrateLegacySettings, resetLegacyMigrationForTests } from '../legacySettings';
import { signOutLocally } from './accountApi';

jest.mock('expo-linking', () => ({ createURL: (path: string) => `famara://${path}` }));

let sessionStored = true;
const mockAuth = {
  signOut: jest.fn(async () => {
    sessionStored = false;
    return { error: null };
  }),
  getSession: jest.fn(async () => ({
    data: { session: sessionStored ? { access_token: 't' } : null },
    error: null,
  })),
};
jest.mock('@/lib/supabase/client', () => ({ getSupabase: () => ({ auth: mockAuth }) }));

/** Stands in for the auth feature's sign-out: sync cannot send, so the device is just wiped. */
const mockEndSession = jest.fn(async () => {
  resetUserStores();
  useSyncStatusStore.getState().reset();
  return false;
});
jest.mock('../deps', () => ({
  ...jest.requireActual<typeof DepsModule>('../deps'),
  endAuthSession: () => mockEndSession(),
  unregisterPushDevice: () => Promise.resolve(),
}));

const OLD_KEY = 'famara:settings.user';

const onboarded = (): Preferences => ({
  ...defaultPreferences,
  onboardedAt: '2026-10-01T00:00:00.000Z',
});

function signIn() {
  useSessionStore.getState().signedIn({
    userId: 'user-1',
    birthYear: 1990,
    onboardingComplete: true,
  });
}

beforeEach(async () => {
  sessionStored = true;
  resetUserStores();
  resetLegacyMigrationForTests();
  await usePersonalDetailsStore.persist.rehydrate();
  Storage.setItemSync(
    OLD_KEY,
    JSON.stringify({
      state: {
        accounts: {
          'user-1': {
            preferences: { allergens: ['peanut'], diets: ['vegan'], cuisines: ['thai'] },
          },
        },
      },
      version: 1,
    }),
  );
  signIn();
  usePreferencesStore.setState({ prefs: onboarded() });
});

afterEach(() => Storage.removeItemSync(OLD_KEY));

it('keeps the old safety answers through an offline sign-out and restores them next time', async () => {
  // A pull completed earlier, but the device is offline now with the merge still to send.
  useSyncStatusStore
    .getState()
    .set({ phase: 'offline', pending: 1, lastSyncedAt: 1_700_000_000_000, lastError: null });

  await signOutLocally();
  expect(useSessionStore.getState().status).toBe('signedOut');
  expect(mockEndSession).toHaveBeenCalled();
  expect(selectAvoidAllergens(usePreferencesStore.getState())).toEqual([]);

  const kept = JSON.parse(Storage.getItemSync(OLD_KEY) ?? '{}') as {
    state: { accounts: Record<string, { preferences: unknown }> };
  };
  expect(kept.state.accounts['user-1']?.preferences).toEqual({
    allergens: ['peanut'],
    diets: ['vegan'],
  });

  // Next sign-in on this device: once sync has pulled, the allergens and diets come back.
  signIn();
  usePreferencesStore.setState({ prefs: onboarded() });
  useSyncStatusStore
    .getState()
    .set({ phase: 'idle', pending: 0, lastSyncedAt: 1_700_000_100_000, lastError: null });
  await expect(migrateLegacySettings('user-1')).resolves.toBe('migrated');
  expect(selectAvoidAllergens(usePreferencesStore.getState())).toEqual(['peanut']);
  expect(usePreferencesStore.getState().prefs.diets).toEqual(['vegan']);
  expect(usePreferencesStore.getState().prefs.cuisines).toEqual([]);
  expect(Storage.getItemSync(OLD_KEY)).toBeNull();
});
