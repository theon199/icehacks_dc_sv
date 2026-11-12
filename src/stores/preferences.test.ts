import Storage from 'expo-sqlite/kv-store';

import { DietFlag } from '@/lib/catalog/types';
import { storageKey } from '@/lib/storage/kv';

import {
  defaultPreferences,
  MAX_CUISINES,
  preferencesSync,
  selectDietMask,
  selectIsOnboarded,
  toggleCuisine,
  updatePreferences,
  usePreferencesStore,
  withAllergens,
} from './preferences';

beforeEach(() => usePreferencesStore.getState().reset());

describe('preference transitions', () => {
  it('returns the same object when nothing changes', () => {
    expect(updatePreferences(defaultPreferences, { householdSize: 1 })).toBe(defaultPreferences);
    expect(updatePreferences(defaultPreferences, { cuisines: [] })).toBe(defaultPreferences);
  });

  it('rejects invalid values', () => {
    expect(updatePreferences(defaultPreferences, { householdSize: 0 })).toBe(defaultPreferences);
    expect(updatePreferences(defaultPreferences, { maxMinutes: 1 })).toBe(defaultPreferences);
  });

  it('caps cuisines and ignores additions beyond the cap', () => {
    let prefs = defaultPreferences;
    for (const cuisine of ['a', 'b', 'c', 'd', 'e', 'f']) prefs = toggleCuisine(prefs, cuisine);
    expect(prefs.cuisines).toHaveLength(MAX_CUISINES);
    expect(prefs.cuisines).not.toContain('f');
    expect(toggleCuisine(prefs, 'a').cuisines).not.toContain('a');
  });

  it('records an explicit "no allergens" answer', () => {
    const prefs = withAllergens(defaultPreferences, []);
    expect(prefs.allergens).toEqual([]);
    expect(prefs.allergensAnswered).toBe(true);
  });
});

describe('usePreferencesStore', () => {
  it('derives the diet mask and onboarding state', () => {
    const store = usePreferencesStore.getState();
    store.toggleDiet('vegetarian');
    store.toggleDiet('gluten_free');
    expect(selectDietMask(usePreferencesStore.getState())).toBe(
      DietFlag.vegetarian | DietFlag.gluten_free,
    );
    expect(selectIsOnboarded(usePreferencesStore.getState())).toBe(false);
    store.completeOnboarding('2026-11-11T10:00:00.000Z');
    store.completeOnboarding('2026-12-01T10:00:00.000Z');
    expect(usePreferencesStore.getState().prefs.onboardedAt).toBe('2026-11-11T10:00:00.000Z');
  });

  it('persists to the key/value store', () => {
    usePreferencesStore.getState().setAllergens(['peanut']);
    const raw = JSON.parse(Storage.getItemSync(storageKey('user.preferences')) ?? '{}');
    expect(raw).toMatchObject({ version: 1, state: { prefs: { allergens: ['peanut'] } } });
  });
});

describe('preferencesSync', () => {
  it('exposes one document and applies valid remote versions only', () => {
    const docs = preferencesSync.getDocs();
    expect([...docs.keys()]).toEqual(['main']);
    expect(preferencesSync.getDocs()).toBe(docs);

    const remote = { ...defaultPreferences, cuisines: ['thai'], householdSize: 3 };
    expect(
      preferencesSync.applyRemote({ upserts: [{ docId: 'main', data: remote }], deletes: [] }),
    ).toEqual({ rejected: [] });
    expect(usePreferencesStore.getState().prefs.cuisines).toEqual(['thai']);

    const bad = preferencesSync.applyRemote({
      upserts: [{ docId: 'main', data: { ...remote, diets: ['carnivore'] } }],
      deletes: [],
    });
    expect(bad.rejected).toEqual(['main']);
    expect(usePreferencesStore.getState().prefs.householdSize).toBe(3);
  });

  it('notifies only when the document changes', () => {
    const listener = jest.fn();
    const unsubscribe = preferencesSync.subscribe(listener);
    usePreferencesStore.getState().update({ householdSize: 1 });
    expect(listener).not.toHaveBeenCalled();
    usePreferencesStore.getState().update({ householdSize: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
