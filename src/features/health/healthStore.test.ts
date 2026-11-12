import Storage from 'expo-sqlite/kv-store';

import { computeDayContext } from '@/domain/health';
import { storageKey } from '@/lib/storage/kv';

import { initialHealth, useHealthStore } from './healthStore';

const NOW = Date.UTC(2026, 10, 11, 9, 0);
const context = computeDayContext({ workouts: [], sleep: [], now: NOW });
const pair = {
  mealId: 'meal-1',
  recipeRef: 'mealdb:1',
  localDate: '2026-11-10',
  startedAt: NOW - 86_400_000,
  baselineMgdl: 100,
  peakMgdl: 130,
  riseMgdl: 30,
  minutesToPeak: 40,
  sampleCount: 24,
};

beforeEach(() => {
  useHealthStore.getState().reset();
});

describe('useHealthStore', () => {
  it('starts off with nothing stored', () => {
    expect(useHealthStore.getState()).toMatchObject(initialHealth);
  });

  it('stores refresh results', () => {
    useHealthStore.getState().setEnabled(true);
    useHealthStore.getState().applyRefresh({ at: NOW, dayContext: context, glucosePairs: [pair] });
    expect(useHealthStore.getState()).toMatchObject({
      lastRefreshAt: NOW,
      dayContext: context,
      glucosePairs: [pair],
    });
  });

  it('keeps the previous value for a part that was not refreshed', () => {
    useHealthStore.getState().applyRefresh({ at: NOW, dayContext: context, glucosePairs: [pair] });
    useHealthStore.getState().applyRefresh({ at: NOW + 1, glucosePairs: [] });
    expect(useHealthStore.getState().dayContext).toEqual(context);
    expect(useHealthStore.getState().glucosePairs).toEqual([]);
  });

  it('forgets health data and stops syncing when turned off', () => {
    const store = useHealthStore.getState();
    store.setEnabled(true);
    store.setSyncEnabled(true);
    store.applyRefresh({ at: NOW, dayContext: context, glucosePairs: [pair] });
    store.markSynced(NOW);
    useHealthStore.getState().setEnabled(false);
    expect(useHealthStore.getState()).toMatchObject({
      enabled: false,
      syncEnabled: false,
      dayContext: null,
      glucosePairs: [],
      lastRefreshAt: null,
      lastSyncedAt: null,
    });
  });

  it('claims unowned data and clears data that belonged to another account', () => {
    useHealthStore.getState().setEnabled(true);
    useHealthStore.getState().claimFor('user-a');
    useHealthStore.getState().applyRefresh({ at: NOW, glucosePairs: [pair] });

    useHealthStore.getState().claimFor('user-a');
    expect(useHealthStore.getState().glucosePairs).toHaveLength(1);

    useHealthStore.getState().claimFor('user-b');
    expect(useHealthStore.getState()).toMatchObject({
      ownerId: 'user-b',
      enabled: false,
      glucosePairs: [],
    });
  });

  it('keeps a pending removal across an account switch and drops it when sync is back on', () => {
    useHealthStore.getState().claimFor('user-a');
    useHealthStore.getState().setRemovalPending('user-a');
    useHealthStore.getState().claimFor('user-b');
    expect(useHealthStore.getState().removalPendingFor).toBe('user-a');

    useHealthStore.getState().setSyncEnabled(true);
    expect(useHealthStore.getState().removalPendingFor).toBeNull();
  });

  it('restores state saved before pending removals were tracked', async () => {
    const { removalPendingFor: _omitted, ...older } = initialHealth;
    Storage.setItemSync(
      storageKey('health.state'),
      JSON.stringify({ state: { ...older, enabled: true }, version: 1 }),
    );
    await useHealthStore.persist.rehydrate();
    expect(useHealthStore.getState()).toMatchObject({ enabled: true, removalPendingFor: null });
  });

  it('persists to device storage and restores from it', async () => {
    useHealthStore.getState().setEnabled(true);
    useHealthStore.getState().applyRefresh({ at: NOW, dayContext: context, glucosePairs: [pair] });
    const saved = Storage.getItemSync(storageKey('health.state'));
    expect(saved).not.toBeNull();

    useHealthStore.getState().reset();
    Storage.setItemSync(storageKey('health.state'), saved ?? '');
    await useHealthStore.persist.rehydrate();
    expect(useHealthStore.getState()).toMatchObject({ enabled: true, glucosePairs: [pair] });
  });

  it('ignores stored state that fails validation', async () => {
    Storage.setItemSync(
      storageKey('health.state'),
      JSON.stringify({ state: { ...initialHealth, enabled: 'yes' }, version: 1 }),
    );
    await useHealthStore.persist.rehydrate();
    expect(useHealthStore.getState().enabled).toBe(false);
  });
});
