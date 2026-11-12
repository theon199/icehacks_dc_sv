/**
 * App-level control of sync for the signed-in account. The auth session store calls
 * `startSync(userId)` once a session exists and `signOutCleanup()` / `accountDeletedCleanup()`
 * when it ends. Nothing here runs before `startSync`, so nothing syncs while signed out.
 */
import { onlineManager } from '@tanstack/react-query';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { z } from 'zod';

import { resetUserStores, userSyncCollections } from '@/stores/userData';

import { describeError, logger } from '../logger';
import { getDeviceId } from './deviceId';
import { createSyncEngine, type SyncEngine } from './engine';
import { kvLedgerStorage } from './ledger';
import { useSyncStatusStore } from './status';
import { createSupabaseTransport } from './transport';
import type { Connectivity, Lifecycle } from './types';
import { defineKvKey } from '../storage/kv';

/** Which account the local user data belongs to. */
const ownerKey = defineKvKey('sync.owner', z.string().min(1));

const connectivity: Connectivity = {
  isOnline: () => onlineManager.isOnline(),
  subscribe: (listener) => onlineManager.subscribe(listener),
};

const lifecycle: Lifecycle = {
  subscribe(listener) {
    if (Platform.OS === 'web') return () => undefined;
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') listener('active');
      else if (state === 'background') listener('background');
    });
    return () => subscription.remove();
  },
};

let engine: SyncEngine | null = null;
let engineUser: string | null = null;

/** Wipes local user data and the sync ledger. Stop the engine first. */
function wipeLocalData(): void {
  resetUserStores();
  kvLedgerStorage.remove();
  void ownerKey.remove();
  useSyncStatusStore.getState().reset();
}

/**
 * Starts syncing for `userId`. If the data on this device belongs to a different account (a
 * sign-out that never finished), it is wiped first so it can never reach this account.
 */
export async function startSync(userId: string): Promise<void> {
  if (engine && engineUser === userId) return;
  await stopSync();

  const owner = ownerKey.getSync();
  if (owner && owner !== userId) {
    logger.warn('Local user data belonged to another account; clearing it');
    wipeLocalData();
  }
  ownerKey.setSync(userId);

  const instance = createSyncEngine({
    userId,
    deviceId: getDeviceId(),
    transport: createSupabaseTransport(userId),
    adapters: userSyncCollections,
    storage: kvLedgerStorage,
    connectivity,
    lifecycle,
    onStatus: (status) => useSyncStatusStore.getState().set(status),
  });
  engine = instance;
  engineUser = userId;
  // Starting waits for every store to load, which can take a moment for Keychain-backed ones.
  instance.start().catch((error: unknown) => {
    logger.error('Sync could not start', describeError(error));
  });
}

/** Stops syncing. Pending changes stay in the outbox for the next start. */
export async function stopSync(): Promise<void> {
  const current = engine;
  engine = null;
  engineUser = null;
  await current?.stop();
}

/** Pushes pending changes now. Resolves false if that did not finish within `timeoutMs`. */
export async function flushSync(timeoutMs = 5000): Promise<boolean> {
  const current = engine;
  if (!current) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([current.flush().then(() => true as const), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Pulls and pushes now, e.g. from pull-to-refresh. */
export function syncNow(): Promise<void> {
  return engine?.syncNow() ?? Promise.resolve();
}

/**
 * Sign-out: send what is still pending (briefly, best effort), then stop and wipe everything this
 * account left on the device.
 */
export async function signOutCleanup(options: { flushTimeoutMs?: number } = {}): Promise<void> {
  const flushed = await flushSync(options.flushTimeoutMs ?? 3000).catch(() => false);
  if (!flushed) logger.warn('Signed out with unsynced changes');
  await stopSync();
  wipeLocalData();
}

/** Account deletion: the server data is gone, so stop and wipe without pushing anything. */
export async function accountDeletedCleanup(): Promise<void> {
  await stopSync();
  wipeLocalData();
}
