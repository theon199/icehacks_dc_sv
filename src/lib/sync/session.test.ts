import { waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';

import { flushPendingWrites, storageKey } from '@/lib/storage/kv';
import {
  defaultPreferences,
  useFeedbackStore,
  usePantryStore,
  resetUserStores,
  usePreferencesStore,
  useSavedStore,
  useVariantStore,
} from '@/stores';

import { FakeSyncServer } from './__fixtures__/fakeServer';
import { memoryAdapter } from './__fixtures__/memoryAdapter';
import { createSyncEngine } from './engine';
import type * as EngineModule from './engine';
import { LEDGER_HEADER_KEY, ledgerBucketKey } from './ledger';
import { registerSyncedStore } from './registry';
import { accountDeletedCleanup, flushSync, signOutCleanup, startSync, stopSync } from './session';
import { useSyncStatusStore } from './status';
import { createSupabaseTransport } from './transport';
import { SyncError, type SyncTransport } from './types';

jest.mock('expo-crypto', () => ({
  randomUUID: () => (jest.requireActual('crypto') as { randomUUID: () => string }).randomUUID(),
}));

jest.mock('./engine', () => {
  const actual = jest.requireActual<typeof EngineModule>('./engine');
  return { ...actual, createSyncEngine: jest.fn(actual.createSyncEngine) };
});

/** The engine the session created most recently. */
const lastEngine = () =>
  jest.mocked(createSyncEngine).mock.results.at(-1)?.value as EngineModule.SyncEngine;

let mockServer: FakeSyncServer;
jest.mock('./transport', () => ({
  createSupabaseTransport: jest.fn(() => mockServer.transport()),
}));

const seed = (collection: string, docId: string, data: Record<string, unknown>) =>
  mockServer.seed({
    collection,
    doc_id: docId,
    data,
    updated_at: '2026-11-01T10:00:00.000Z',
    device_id: 'other-device',
    deleted_at: null,
  });

beforeEach(async () => {
  await stopSync();
  mockServer = new FakeSyncServer();
  Storage.clearSync();
  usePreferencesStore.getState().reset();
  usePantryStore.getState().reset();
  useSavedStore.getState().reset();
  useVariantStore.getState().reset();
  useFeedbackStore.getState().reset();
});

afterAll(() => stopSync());

describe('sync session', () => {
  it('pulls the account data into the stores and pushes local edits', async () => {
    seed('preferences', 'main', { ...defaultPreferences, cuisines: ['thai'], householdSize: 2 });
    seed('saved_recipes', 'mealdb:1', {
      recipeId: 'mealdb:1',
      savedAt: '2026-11-01T10:00:00.000Z',
    });
    await startSync('user-1');
    expect(createSupabaseTransport).toHaveBeenCalledWith('user-1');

    await waitFor(() => expect(usePreferencesStore.getState().prefs.cuisines).toEqual(['thai']));
    expect(useSavedStore.getState().saved['mealdb:1']).toBeDefined();

    useSavedStore.getState().save('mealdb:2');
    await expect(flushSync()).resolves.toBe(true);
    expect(mockServer.get('saved_recipes', 'mealdb:2')?.data).toMatchObject({
      recipeId: 'mealdb:2',
    });
    // Defaults for collections the account never had are created once, after the merge.
    expect(mockServer.get('settings', 'main')).toBeDefined();
    expect(useSyncStatusStore.getState().pending).toBe(0);
  });

  it('wipes data another account left on the device before syncing', async () => {
    await startSync('user-a');
    usePantryStore.getState().add({ name: 'secret stash' });
    await flushSync();
    await stopSync();

    await startSync('user-b');
    expect(usePantryStore.getState().items).toEqual({});
    await waitFor(() => expect(useSyncStatusStore.getState().phase).toBe('idle'));
    await flushSync();
    const pushed = mockServer.pushCalls.slice(1).flat();
    expect(pushed.some((doc) => JSON.stringify(doc.data).includes('secret stash'))).toBe(false);
  });

  it('flushes, stops and clears everything on sign-out', async () => {
    await startSync('user-1');
    await waitFor(() => expect(useSyncStatusStore.getState().phase).toBe('idle'));
    usePantryStore.getState().add({ name: 'rice' });
    usePreferencesStore.getState().update({ householdSize: 4 });
    await signOutCleanup();

    expect([...mockServer.rows.values()].some((row) => row.collection === 'pantry')).toBe(true);
    expect(usePantryStore.getState().items).toEqual({});
    expect(usePreferencesStore.getState().prefs).toEqual(defaultPreferences);
    expect(Storage.getItemSync(storageKey('user.pantry'))).toBeNull();
    expect(Storage.getItemSync(storageKey(LEDGER_HEADER_KEY))).toBeNull();
    expect(Storage.getItemSync(storageKey(ledgerBucketKey('pantry')))).toBeNull();
    expect(Storage.getItemSync(storageKey('sync.owner'))).toBeNull();
    await waitFor(async () =>
      expect(await SecureStore.getItemAsync('famara.user.personal_details')).toBeNull(),
    );

    // Nothing syncs once signed out.
    const calls = mockServer.pushCalls.length + mockServer.pullCalls.length;
    usePantryStore.getState().add({ name: 'after sign-out' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockServer.pushCalls.length + mockServer.pullCalls.length).toBe(calls);
  });

  it('clears without pushing after account deletion', async () => {
    await startSync('user-1');
    await waitFor(() => expect(useSyncStatusStore.getState().phase).toBe('idle'));
    const pushes = mockServer.pushCalls.length;
    usePantryStore.getState().add({ name: 'unsent' });
    await accountDeletedCleanup();
    expect(mockServer.pushCalls.length).toBe(pushes);
    expect(usePantryStore.getState().items).toEqual({});
  });

  it('creates a single engine when the same sign-in is reported twice in one tick', async () => {
    const probe = memoryAdapter('probe');
    const unregister = registerSyncedStore({ adapter: probe, reset: () => probe.docs.clear() });
    try {
      await Promise.all([startSync('user-1'), startSync('user-1')]);
      await waitFor(() => expect(useSyncStatusStore.getState().phase).toBe('idle'));
      expect(createSyncEngine).toHaveBeenCalledTimes(1);
      expect(probe.listenerCount).toBe(1);

      await signOutCleanup();
      expect(probe.listenerCount).toBe(0);
    } finally {
      unregister();
    }
  });

  it('syncs saved variants and wipes them on sign-out without any screen loading them', async () => {
    const variant = {
      id: 'v1',
      baseRecipeId: 'r:dal',
      title: 'Lighter dal',
      servings: 2,
      goals: [],
      request: null,
      ingredients: ['1 cup red lentils'],
      steps: ['Simmer until soft.'],
      swaps: [],
      note: '',
      createdAt: '2026-11-01T10:00:00.000Z',
    };
    seed('variants', 'r:dal', {
      baseRecipeId: 'r:dal',
      updatedAt: variant.createdAt,
      variants: [variant],
    });
    await startSync('user-1');
    await waitFor(() => expect(useVariantStore.getState().groups['r:dal']).toBeDefined());

    useVariantStore.getState().save({ ...variant, id: 'w1', baseRecipeId: 'r:soup' });
    await expect(flushSync()).resolves.toBe(true);
    expect(mockServer.get('variants', 'r:soup')?.data).toMatchObject({ baseRecipeId: 'r:soup' });

    await signOutCleanup();
    expect(useVariantStore.getState().groups).toEqual({});
    expect(Storage.getItemSync(storageKey('user.variants'))).toBeNull();
  });

  it('refuses a direct reset of the user stores while sync runs', async () => {
    await startSync('user-1');
    await waitFor(() => expect(useSyncStatusStore.getState().phase).toBe('idle'));
    usePantryStore.getState().add({ name: 'kept' });
    expect(() => resetUserStores()).toThrow(/sync is running/);
    expect(Object.values(usePantryStore.getState().items)).toHaveLength(1);
    await stopSync();
    expect(() => resetUserStores()).not.toThrow();
    expect(usePantryStore.getState().items).toEqual({});
  });

  it('allows a direct reset as soon as the engine stops itself', async () => {
    const refusing: SyncTransport = {
      pull: () => Promise.reject(new SyncError('wrong_user', 'another account')),
      push: () => Promise.reject(new SyncError('wrong_user', 'another account')),
    };
    jest.mocked(createSupabaseTransport).mockImplementationOnce(() => refusing);
    await startSync('user-1');
    const engine = lastEngine();
    await waitFor(() => expect(engine.isStopped()).toBe(true));
    usePantryStore.getState().add({ name: 'left behind' });
    expect(() => resetUserStores()).not.toThrow();
    expect(usePantryStore.getState().items).toEqual({});
  });

  it('never saves the ledger ahead of a store write the disk refused', async () => {
    const feedbackKey = storageKey('user.feedback');
    const feedbackBucket = () => Storage.getItemSync(storageKey(ledgerBucketKey('feedback'))) ?? '';
    const write = jest.mocked(Storage.setItemSync);
    const healthy = write.getMockImplementation();
    await startSync('user-1');
    await waitFor(() => expect(useSyncStatusStore.getState().phase).toBe('idle'));

    try {
      // The disk refuses the feedback store's write (the real deferred-write path), not the ledger's.
      write.mockImplementation((key, value) => {
        if (key === feedbackKey) throw new Error('disk full');
        healthy?.(key, value);
      });
      useFeedbackStore.getState().record({ recipeId: 'mealdb:7', kind: 'like' });
      const [eventId = ''] = Object.keys(useFeedbackStore.getState().events);
      await expect(flushSync()).resolves.toBe(true);
      expect(mockServer.get('feedback', eventId)).toBeDefined();

      // Stopping saves the ledger, except that it would now describe an event the store lost.
      await stopSync();
      expect(Storage.getItemSync(feedbackKey) ?? '').not.toContain(eventId);
      expect(feedbackBucket()).not.toContain(eventId);

      // The disk recovers: the store's write goes through, and then the ledger's.
      write.mockImplementation(healthy);
      flushPendingWrites();
      expect(Storage.getItemSync(feedbackKey)).toContain(eventId);
      await startSync('user-1');
      await waitFor(() => expect(useSyncStatusStore.getState().phase).toBe('idle'));
      await expect(flushSync()).resolves.toBe(true);
      await stopSync();
      expect(feedbackBucket()).toContain(eventId);
      expect(mockServer.get('feedback', eventId)?.deleted_at).toBeNull();
    } finally {
      write.mockImplementation(healthy);
    }
  });

  it('starts a fresh engine for the same account after one stopped itself', async () => {
    const refusing: SyncTransport = {
      pull: () => Promise.reject(new SyncError('wrong_user', 'another account')),
      push: () => Promise.reject(new SyncError('wrong_user', 'another account')),
    };
    jest.mocked(createSupabaseTransport).mockImplementationOnce(() => refusing);
    await startSync('user-1');
    const first = lastEngine();
    await waitFor(() => expect(first.isStopped()).toBe(true));
    const engines = jest.mocked(createSyncEngine).mock.calls.length;

    await startSync('user-1');
    expect(jest.mocked(createSyncEngine).mock.calls.length).toBe(engines + 1);
    await waitFor(() => expect(useSyncStatusStore.getState().phase).toBe('idle'));
    usePantryStore.getState().add({ name: 'after the restart' });
    await expect(flushSync()).resolves.toBe(true);
    expect(
      [...mockServer.rows.values()].some((row) => JSON.stringify(row.data).includes('restart')),
    ).toBe(true);
  });

  it('leaves nothing running when sign-out follows sign-in immediately', async () => {
    seed('pantry', 'p1', { name: 'from the account' });
    const started = startSync('user-1');
    const signedOut = signOutCleanup();
    await Promise.all([started, signedOut]);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockServer.pullCalls).toHaveLength(0);
    expect(mockServer.pushCalls).toHaveLength(0);
    expect(Storage.getItemSync(storageKey('sync.owner'))).toBeNull();
    expect(Storage.getItemSync(storageKey(LEDGER_HEADER_KEY))).toBeNull();
    expect(usePantryStore.getState().items).toEqual({});
    expect(useSyncStatusStore.getState().phase).not.toBe('idle');
  });
});
