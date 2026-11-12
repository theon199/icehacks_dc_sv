import Storage from 'expo-sqlite/kv-store';

import { clearCatalogCaches } from '@/lib/catalog';
import { describeCatalogDb } from '@/lib/catalog/__fixtures__/nodeCatalogDb';
import { resetCatalogForTests } from '@/lib/db/catalog';
import { storageKey } from '@/lib/storage/kv';
import type * as StoresModule from '@/stores';
import {
  defaultPreferences,
  selectAvoidAllergens,
  selectHasAnsweredAllergens,
  selectIsOnboarded,
  usePantryStore,
  usePreferencesStore,
} from '@/stores';

import * as setupDeps from './deps';
import type { OnboardingAnswers } from './onboardingModel';

jest.mock(
  'expo-sqlite',
  () => jest.requireActual('@/lib/catalog/__fixtures__/nodeCatalogDb').expoSqliteFake as unknown,
);
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ hash: 'feedc0ffee00' }) } }));
jest.mock('expo-crypto', () => ({
  randomUUID: () => (jest.requireActual('crypto') as { randomUUID: () => string }).randomUUID(),
}));

const answers = (overrides: Partial<OnboardingAnswers> = {}): OnboardingAnswers => ({
  displayName: 'Kofi',
  cuisines: ['thai', 'west_african'],
  diets: ['pescatarian'],
  allergens: ['sesame', 'peanut'],
  goals: ['more_fiber', 'steady_energy'],
  timeBudgetMinutes: 45,
  effort: 2,
  householdSize: 3,
  pantryStaples: ['olive_oil'],
  smallAppetite: false,
  ...overrides,
});

const { loadCuisineOptions, loadPantryStaples, readSavedAnswers, saveOnboarding } = setupDeps;

const oliveOil: setupDeps.PantryStaple = { id: 'olive_oil', name: 'olive oil', category: 'oil' };

beforeEach(() => {
  usePreferencesStore.getState().reset();
  usePantryStore.getState().reset();
});

describe('saveOnboarding', () => {
  it('writes the answers into the shared preferences and pantry stores', () => {
    saveOnboarding(answers(), [oliveOil]);

    const state = usePreferencesStore.getState();
    expect(state.prefs).toMatchObject({
      displayName: 'Kofi',
      cuisines: ['thai', 'west_african'],
      diets: ['pescatarian'],
      goals: ['more_fiber', 'steadier_energy'],
      maxMinutes: 45,
      effort: 2,
      householdSize: 3,
      smallAppetite: false,
    });
    expect(selectAvoidAllergens(state)).toEqual(['sesame', 'peanut']);
    expect(selectHasAnsweredAllergens(state)).toBe(true);
    expect(selectIsOnboarded(state)).toBe(true);
    expect(Object.values(usePantryStore.getState().items)).toEqual([
      expect.objectContaining({ ingredientId: 'olive_oil', name: 'olive oil', category: 'oil' }),
    ]);
  });

  it('records an explicit "no allergies" as answered', () => {
    saveOnboarding(answers({ allergens: [] }), []);
    const state = usePreferencesStore.getState();
    expect(selectAvoidAllergens(state)).toEqual([]);
    expect(selectHasAnsweredAllergens(state)).toBe(true);
  });

  it('throws and leaves onboarding open when an answer does not fit', () => {
    expect(() => saveOnboarding(answers({ householdSize: 50 }), [oliveOil])).toThrow();
    expect(usePreferencesStore.getState().prefs).toEqual(defaultPreferences);
    expect(usePantryStore.getState().items).toEqual({});
  });

  it('prefills from answers already on the account, in the onboarding vocabulary', () => {
    expect(readSavedAnswers()).toBeNull();
    saveOnboarding(answers(), [oliveOil]);
    expect(readSavedAnswers()).toEqual({ ...answers(), pantryStaples: [] });
  });

  it('keeps the answers across a relaunch', () => {
    saveOnboarding(answers(), [oliveOil]);
    expect(Storage.getItemSync(storageKey('user.preferences'))).not.toBeNull();

    jest.isolateModules(() => {
      // A fresh launch: every module is loaded again and hydrates from what is on disk. The account
      // flow's own modules load too, to show none of them claims or clears the preferences key.
      jest.requireActual('@/features/auth/deps');
      const setup = jest.requireActual<typeof setupDeps>('./deps');
      const stores = jest.requireActual<typeof StoresModule>('@/stores');
      expect(stores.usePreferencesStore).not.toBe(usePreferencesStore);

      const prefs = stores.usePreferencesStore.getState();
      expect(stores.selectIsOnboarded(prefs)).toBe(true);
      expect(stores.selectHasAnsweredAllergens(prefs)).toBe(true);
      expect(stores.selectAvoidAllergens(prefs)).toEqual(['sesame', 'peanut']);
      expect(prefs.prefs.maxMinutes).toBe(45);
      expect(stores.selectPantryCount(stores.usePantryStore.getState())).toBe(1);
      expect(setup.readSavedAnswers()?.goals).toEqual(['more_fiber', 'steady_energy']);
    });
  });
});

describeCatalogDb('catalog reads', () => {
  beforeEach(() => {
    resetCatalogForTests();
    clearCatalogCaches();
  });

  it('lists each cuisine once, with its region', async () => {
    const options = await loadCuisineOptions();
    expect(options.length).toBeGreaterThan(0);
    const ids = options.map((option) => option.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const option of options) {
      expect(option.region).toEqual(expect.any(String));
      expect(option.recipeCount).toBeGreaterThan(0);
    }
  });

  it('offers only pantry staples, grouped by shelf', async () => {
    const staples = await loadPantryStaples();
    expect(staples.length).toBeGreaterThan(0);
    expect(staples.map((staple) => staple.id)).toContain('onion');
    const categories = staples.map((staple) => staple.category);
    expect(categories).toEqual([...categories].sort((a, b) => a.localeCompare(b)));
  });
});
