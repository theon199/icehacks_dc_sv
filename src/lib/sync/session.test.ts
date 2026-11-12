import { waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';

import { storageKey } from '@/lib/storage/kv';
import { defaultPreferences, usePantryStore, usePreferencesStore, useSavedStore } from '@/stores';

import { FakeSyncServer } from './__fixtures__/fakeServer';
import { accountDeletedCleanup, flushSync, signOutCleanup, startSync, stopSync } from './session';
import { useSyncStatusStore } from './status';
import { createSupabaseTransport } from './transport';

jest.mock('expo-crypto', () => ({
  randomUUID: () => (jest.requireActual('crypto') as { randomUUID: () => string }).randomUUID(),
}));

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
    expect(Storage.getItemSync(storageKey('sync.ledger'))).toBeNull();
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
});
