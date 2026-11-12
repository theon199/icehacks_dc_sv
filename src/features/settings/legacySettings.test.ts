import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';

import { useSessionStore } from '@/features/auth';
import { useSyncStatusStore } from '@/lib/sync';
import {
  defaultPreferences,
  resetUserStores,
  selectAvoidAllergens,
  selectHasAnsweredAllergens,
  usePersonalDetailsStore,
  usePreferencesStore,
  useSettingsStore,
  type Preferences,
} from '@/stores';

import {
  discardLegacyAccount,
  migrateLegacySettings,
  planLegacyMigration,
  resetLegacyMigrationForTests,
  useLegacySettingsMigration,
} from './legacySettings';

const OLD_KEY = 'famara:settings.user';
const oldPersonalKey = (userId: string) => `famara.personal-details.${userId}`;

function writeOldSettings(accounts: Record<string, unknown>): void {
  Storage.setItemSync(OLD_KEY, JSON.stringify({ state: { accounts }, version: 1 }));
}

const oldEntry = (preferences: Record<string, unknown>, notifications = {}) => ({
  preferences: {
    cuisines: [],
    diets: [],
    allergens: null,
    goals: [],
    timeBudgetMinutes: null,
    effort: 2,
    householdSize: 2,
    smallAppetite: false,
    units: 'us',
    ...preferences,
  },
  notifications: { cookTimers: false, social: false, follows: false, ...notifications },
});

const onboarded = (patch: Partial<Preferences> = {}): Preferences => ({
  ...defaultPreferences,
  onboardedAt: '2026-10-01T00:00:00.000Z',
  ...patch,
});

function oldAccounts(): string[] {
  const raw = Storage.getItemSync(OLD_KEY);
  if (raw == null) return [];
  return Object.keys((JSON.parse(raw) as { state: { accounts: object } }).state.accounts);
}

function setSyncStatus(phase: 'idle' | 'syncing' | 'stopped', lastSyncedAt: number | null): void {
  useSyncStatusStore.getState().set({ phase, pending: 0, lastSyncedAt, lastError: null });
}

/** This sync run has completed a pull. */
const syncPulled = () => setSyncStatus('idle', 1_700_000_000_000);

function signIn(userId = 'user-1') {
  useSessionStore.getState().signedIn({ userId, birthYear: 1990, onboardingComplete: true });
}

beforeEach(async () => {
  resetUserStores();
  resetLegacyMigrationForTests();
  await usePersonalDetailsStore.persist.rehydrate();
  Storage.removeItemSync(OLD_KEY);
  await SecureStore.deleteItemAsync(oldPersonalKey('user-1'));
  await SecureStore.deleteItemAsync(oldPersonalKey('user-2'));
  useSyncStatusStore.getState().reset();
  signIn();
});

describe('planLegacyMigration', () => {
  it('adds old allergens and diets to the shared ones, never removing any', () => {
    const plan = planLegacyMigration(
      oldEntry({ allergens: ['peanut', 'milk'], diets: ['vegan'] }),
      onboarded({ allergens: ['sesame'], allergensAnswered: true, diets: ['halal_friendly'] }),
    );
    expect(plan.allergens).toEqual(['sesame', 'peanut', 'milk']);
    expect(plan.preferences.diets).toEqual(['halal_friendly', 'vegan']);
  });

  it('records an explicit "no allergies" only when the shared store has no answer yet', () => {
    expect(planLegacyMigration(oldEntry({ allergens: [] }), onboarded()).allergens).toEqual([]);
    const answered = onboarded({ allergens: ['egg'], allergensAnswered: true });
    expect(planLegacyMigration(oldEntry({ allergens: [] }), answered).allergens).toBeUndefined();
  });

  it('leaves allergens alone when the old entry never answered', () => {
    const plan = planLegacyMigration(oldEntry({}), onboarded());
    expect(plan.allergens).toBeUndefined();
  });

  it('carries over chosen answers in the shared vocabulary and skips the old defaults', () => {
    const plan = planLegacyMigration(
      oldEntry(
        {
          cuisines: ['thai', 'Not A Slug'],
          goals: ['steady_energy', 'more_fiber', 'made_up'],
          timeBudgetMinutes: 30,
          effort: 3,
          smallAppetite: true,
          units: 'metric',
        },
        { cookTimers: true },
      ),
      onboarded({ householdSize: 4 }),
    );
    expect(plan.preferences).toEqual({
      cuisines: ['thai'],
      goals: ['steadier_energy', 'more_fiber'],
      maxMinutes: 30,
      effort: 3,
      smallAppetite: true,
    });
    expect(plan).toMatchObject({ units: 'metric', cookTimers: true });
  });

  it('drops values the shared store would refuse instead of the whole entry', () => {
    const plan = planLegacyMigration(
      oldEntry({ timeBudgetMinutes: 1000, householdSize: 40, allergens: ['peanut', 'acorn'] }),
      onboarded(),
    );
    expect(plan.preferences).toEqual({});
    expect(plan.allergens).toEqual(['peanut']);
    expect(planLegacyMigration('garbage', onboarded())).toEqual({ preferences: {} });
  });
});

describe('migrateLegacySettings', () => {
  beforeEach(() => syncPulled());

  it('moves the account’s old answers into the shared stores and deletes only its own copies', async () => {
    usePreferencesStore.setState({
      prefs: onboarded({ allergens: ['milk'], allergensAnswered: true }),
    });
    writeOldSettings({
      'user-1': oldEntry({ allergens: ['peanut'], units: 'metric' }),
      'user-2': oldEntry({ allergens: ['egg'] }),
    });
    await SecureStore.setItemAsync(
      oldPersonalKey('user-1'),
      JSON.stringify({ heightCm: 170, weightKg: 65, sex: 'female', activity: 'light' }),
    );
    await SecureStore.setItemAsync(oldPersonalKey('user-2'), JSON.stringify({ heightCm: 150 }));

    await expect(migrateLegacySettings('user-1')).resolves.toBe('migrated');

    const prefs = usePreferencesStore.getState();
    expect(selectAvoidAllergens(prefs)).toEqual(['milk', 'peanut']);
    expect(selectHasAnsweredAllergens(prefs)).toBe(true);
    expect(useSettingsStore.getState().settings.units).toBe('metric');
    expect(usePersonalDetailsStore.getState().details).toEqual({
      heightCm: 170,
      weightKg: 65,
      sex: 'female',
      activity: 'light',
    });
    expect(await SecureStore.getItemAsync(oldPersonalKey('user-1'))).toBeNull();
    // The other account's answers wait for that account.
    expect(oldAccounts()).toEqual(['user-2']);
    expect(await SecureStore.getItemAsync(oldPersonalKey('user-2'))).not.toBeNull();

    // Once moved, there is nothing left to do for this account.
    await expect(migrateLegacySettings('user-1')).resolves.toBe('nothing');
  });

  it('keeps the old allergens and diets until sync confirms the push (offline sign-out)', async () => {
    usePreferencesStore.setState({ prefs: onboarded() });
    writeOldSettings({
      'user-1': oldEntry({ allergens: ['peanut'], diets: ['vegan'], cuisines: ['thai'] }),
    });
    await SecureStore.setItemAsync(oldPersonalKey('user-1'), JSON.stringify({ heightCm: 170 }));
    // Offline: the merged answers are still waiting to be sent.
    useSyncStatusStore
      .getState()
      .set({ phase: 'offline', pending: 1, lastSyncedAt: 1_700_000_000_000, lastError: null });

    await expect(migrateLegacySettings('user-1')).resolves.toBe('migrated');
    expect(selectAvoidAllergens(usePreferencesStore.getState())).toEqual(['peanut']);

    // The only durable copy survives a wipe, cut down to the safety answers.
    const kept = JSON.parse(Storage.getItemSync(OLD_KEY) ?? '{}') as {
      state: { accounts: Record<string, { preferences: Record<string, unknown> }> };
    };
    expect(kept.state.accounts['user-1']?.preferences).toEqual({
      allergens: ['peanut'],
      diets: ['vegan'],
    });
    expect(await SecureStore.getItemAsync(oldPersonalKey('user-1'))).not.toBeNull();

    // A wipe and a later run merge the allergens back in.
    resetUserStores();
    usePreferencesStore.setState({ prefs: onboarded() });
    syncPulled();
    await expect(migrateLegacySettings('user-1')).resolves.toBe('migrated');
    expect(selectAvoidAllergens(usePreferencesStore.getState())).toEqual(['peanut']);
    expect(usePreferencesStore.getState().prefs.cuisines).toEqual([]);
    expect(oldAccounts()).toEqual([]);
  });

  it('moves each account’s answers when that account signs in, then removes the old key', async () => {
    writeOldSettings({
      'user-1': oldEntry({ allergens: ['peanut'] }),
      'user-2': oldEntry({ allergens: ['egg'] }),
    });
    usePreferencesStore.setState({ prefs: onboarded() });
    await expect(migrateLegacySettings('user-1')).resolves.toBe('migrated');
    expect(selectAvoidAllergens(usePreferencesStore.getState())).toEqual(['peanut']);

    // user-2 signs in on the same device; sign-out wiped user-1's stores.
    resetUserStores();
    signIn('user-2');
    usePreferencesStore.setState({ prefs: onboarded() });
    syncPulled();
    await expect(migrateLegacySettings('user-2')).resolves.toBe('migrated');
    expect(selectAvoidAllergens(usePreferencesStore.getState())).toEqual(['egg']);
    expect(Storage.getItemSync(OLD_KEY)).toBeNull();
  });

  it('keeps personal details already in the shared store', async () => {
    usePreferencesStore.setState({ prefs: onboarded() });
    usePersonalDetailsStore.getState().update({ heightCm: 180 });
    await SecureStore.setItemAsync(oldPersonalKey('user-1'), JSON.stringify({ heightCm: 160 }));

    await expect(migrateLegacySettings('user-1')).resolves.toBe('migrated');
    expect(usePersonalDetailsStore.getState().details.heightCm).toBe(180);
    expect(await SecureStore.getItemAsync(oldPersonalKey('user-1'))).toBeNull();
  });

  it('leaves a malformed old entry in place and still handles each account’s Keychain copy', async () => {
    usePreferencesStore.setState({ prefs: onboarded() });
    Storage.setItemSync(OLD_KEY, '{not json');
    await SecureStore.setItemAsync(oldPersonalKey('user-1'), JSON.stringify({ heightCm: 160 }));
    await SecureStore.setItemAsync(oldPersonalKey('user-2'), JSON.stringify({ heightCm: 150 }));

    await expect(migrateLegacySettings('user-1')).resolves.toBe('migrated');
    expect(usePersonalDetailsStore.getState().details.heightCm).toBe(160);
    expect(Storage.getItemSync(OLD_KEY)).toBe('{not json');
    expect(await SecureStore.getItemAsync(oldPersonalKey('user-2'))).not.toBeNull();

    Storage.setItemSync(OLD_KEY, JSON.stringify({ state: { owner: 'x' } }));
    await expect(migrateLegacySettings('user-1')).resolves.toBe('nothing');
    expect(Storage.getItemSync(OLD_KEY)).not.toBeNull();
  });

  it('waits while the shared stores do not hold this account’s answers yet', async () => {
    writeOldSettings({ 'user-1': oldEntry({ allergens: ['peanut'] }) });
    await expect(migrateLegacySettings('user-1')).resolves.toBe('notReady');
    expect(Storage.getItemSync(OLD_KEY)).not.toBeNull();
    expect(usePreferencesStore.getState().prefs.allergens).toEqual([]);
  });

  it('waits until this sync run has completed a pull', async () => {
    usePreferencesStore.setState({ prefs: onboarded() });
    writeOldSettings({ 'user-1': oldEntry({ allergens: ['peanut'] }) });
    // Sync has started but its first pull has not finished.
    setSyncStatus('idle', null);
    await expect(migrateLegacySettings('user-1')).resolves.toBe('notReady');
    setSyncStatus('stopped', 1);
    await expect(migrateLegacySettings('user-1')).resolves.toBe('notReady');
    expect(usePreferencesStore.getState().prefs.allergens).toEqual([]);
    expect(Storage.getItemSync(OLD_KEY)).not.toBeNull();
  });

  it('does nothing for an account that is no longer signed in', async () => {
    usePreferencesStore.setState({ prefs: onboarded() });
    writeOldSettings({ 'user-1': oldEntry({ allergens: ['peanut'] }) });
    signIn('user-2');
    await expect(migrateLegacySettings('user-1')).resolves.toBe('notReady');
    expect(Storage.getItemSync(OLD_KEY)).not.toBeNull();
  });
});

describe('discardLegacyAccount', () => {
  it('removes only the named account’s old entry and Keychain details', async () => {
    writeOldSettings({ 'user-1': oldEntry({}), 'user-2': oldEntry({}) });
    await SecureStore.setItemAsync(oldPersonalKey('user-1'), '{}');
    await SecureStore.setItemAsync(oldPersonalKey('user-2'), '{}');
    await discardLegacyAccount('user-1');
    expect(oldAccounts()).toEqual(['user-2']);
    expect(await SecureStore.getItemAsync(oldPersonalKey('user-1'))).toBeNull();
    expect(await SecureStore.getItemAsync(oldPersonalKey('user-2'))).not.toBeNull();

    await discardLegacyAccount('user-2');
    expect(Storage.getItemSync(OLD_KEY)).toBeNull();
  });
});

describe('useLegacySettingsMigration', () => {
  it('runs only once a pull has completed, even if the pull lands late', async () => {
    usePreferencesStore.setState({ prefs: onboarded() });
    writeOldSettings({ 'user-1': oldEntry({ allergens: ['sesame'] }) });
    await renderHook(() => useLegacySettingsMigration());
    await act(async () => setSyncStatus('syncing', null));
    await act(async () => setSyncStatus('idle', null));
    // Sync started, but nothing has been pulled yet: no write may happen.
    expect(Storage.getItemSync(OLD_KEY)).not.toBeNull();
    expect(selectAvoidAllergens(usePreferencesStore.getState())).toEqual([]);

    await act(async () => setSyncStatus('idle', 1_700_000_000_000));
    await waitFor(() => expect(Storage.getItemSync(OLD_KEY)).toBeNull());
    expect(selectAvoidAllergens(usePreferencesStore.getState())).toEqual(['sesame']);
  });

  it('retries a run that was not ready on the next completed sync round', async () => {
    writeOldSettings({ 'user-1': oldEntry({ allergens: ['sesame'] }) });
    await renderHook(() => useLegacySettingsMigration());
    // Not onboarded yet, so the first attempt waits.
    await act(async () => setSyncStatus('idle', 1));
    expect(Storage.getItemSync(OLD_KEY)).not.toBeNull();

    await act(async () => usePreferencesStore.setState({ prefs: onboarded() }));
    await act(async () => setSyncStatus('idle', 2));
    await waitFor(() => expect(Storage.getItemSync(OLD_KEY)).toBeNull());
  });

  it('starts a separate run for an account that signs in while another run is pending', async () => {
    usePreferencesStore.setState({ prefs: onboarded() });
    writeOldSettings({
      'user-1': oldEntry({ allergens: ['sesame'] }),
      'user-2': oldEntry({ allergens: ['egg'] }),
    });
    // user-1's Keychain read hangs, so its run is still in flight when user-2 signs in.
    let release: (value: string | null) => void = () => undefined;
    const keychainRead = jest.mocked(SecureStore.getItemAsync);
    const passThrough = keychainRead.getMockImplementation();
    keychainRead.mockImplementation((key, options) =>
      key === oldPersonalKey('user-1')
        ? new Promise((resolve) => {
            release = resolve;
          })
        : (passThrough?.(key, options) ?? Promise.resolve(null)),
    );
    await renderHook(() => useLegacySettingsMigration());
    await act(async () => setSyncStatus('idle', 1));
    await act(async () => signIn('user-2'));

    await waitFor(() => expect(oldAccounts()).toEqual(['user-1']));
    expect(selectAvoidAllergens(usePreferencesStore.getState())).toEqual(['egg']);

    // user-1's late run must not write into user-2's stores.
    await act(async () => release(null));
    expect(selectAvoidAllergens(usePreferencesStore.getState())).toEqual(['egg']);
    expect(oldAccounts()).toEqual(['user-1']);
    if (passThrough) keychainRead.mockImplementation(passThrough);
  });
});
