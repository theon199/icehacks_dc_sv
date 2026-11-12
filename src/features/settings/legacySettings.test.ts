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
  discardLegacySettings,
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
  it('moves the account’s old answers into the shared stores and deletes every old copy', async () => {
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

    await expect(migrateLegacySettings('user-1')).resolves.toBe(true);

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
    expect(Storage.getItemSync(OLD_KEY)).toBeNull();
    expect(await SecureStore.getItemAsync(oldPersonalKey('user-1'))).toBeNull();
    expect(await SecureStore.getItemAsync(oldPersonalKey('user-2'))).toBeNull();

    // Once moved, there is nothing left to do.
    await expect(migrateLegacySettings('user-1')).resolves.toBe(false);
  });

  it('keeps personal details already in the shared store', async () => {
    usePreferencesStore.setState({ prefs: onboarded() });
    usePersonalDetailsStore.getState().update({ heightCm: 180 });
    await SecureStore.setItemAsync(oldPersonalKey('user-1'), JSON.stringify({ heightCm: 160 }));

    await expect(migrateLegacySettings('user-1')).resolves.toBe(true);
    expect(usePersonalDetailsStore.getState().details.heightCm).toBe(180);
    expect(await SecureStore.getItemAsync(oldPersonalKey('user-1'))).toBeNull();
  });

  it('waits while the shared stores do not hold this account’s answers yet', async () => {
    writeOldSettings({ 'user-1': oldEntry({ allergens: ['peanut'] }) });
    await expect(migrateLegacySettings('user-1')).resolves.toBe(false);
    expect(Storage.getItemSync(OLD_KEY)).not.toBeNull();
    expect(usePreferencesStore.getState().prefs.allergens).toEqual([]);
  });

  it('does nothing for an account that is no longer signed in', async () => {
    usePreferencesStore.setState({ prefs: onboarded() });
    writeOldSettings({ 'user-1': oldEntry({ allergens: ['peanut'] }) });
    signIn('user-2');
    await expect(migrateLegacySettings('user-1')).resolves.toBe(false);
    expect(Storage.getItemSync(OLD_KEY)).not.toBeNull();
  });
});

describe('discardLegacySettings', () => {
  it('removes the old entry and the Keychain details of every account it names', async () => {
    writeOldSettings({ 'user-2': oldEntry({}) });
    await SecureStore.setItemAsync(oldPersonalKey('user-1'), '{}');
    await SecureStore.setItemAsync(oldPersonalKey('user-2'), '{}');
    await discardLegacySettings('user-1');
    expect(Storage.getItemSync(OLD_KEY)).toBeNull();
    expect(await SecureStore.getItemAsync(oldPersonalKey('user-1'))).toBeNull();
    expect(await SecureStore.getItemAsync(oldPersonalKey('user-2'))).toBeNull();
  });
});

describe('useLegacySettingsMigration', () => {
  it('runs once sync has started for the signed-in account', async () => {
    usePreferencesStore.setState({ prefs: onboarded() });
    writeOldSettings({ 'user-1': oldEntry({ allergens: ['sesame'] }) });
    await renderHook(() => useLegacySettingsMigration());
    await act(async () => undefined);
    // Sync has not confirmed the local stores belong to this account yet.
    expect(Storage.getItemSync(OLD_KEY)).not.toBeNull();

    await act(async () => {
      useSyncStatusStore.getState().set({
        phase: 'idle',
        pending: 0,
        lastSyncedAt: null,
        lastError: null,
      });
    });
    await waitFor(() => expect(Storage.getItemSync(OLD_KEY)).toBeNull());
    expect(selectAvoidAllergens(usePreferencesStore.getState())).toEqual(['sesame']);
  });
});
