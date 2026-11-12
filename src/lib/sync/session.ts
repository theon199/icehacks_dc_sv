/**
 * App-level control of sync for the signed-in account. The auth session store calls
 * `startSync(userId)` once a session exists and `signOutCleanup()` / `accountDeletedCleanup()`
 * when it ends. Nothing here runs before `startSync`, so nothing syncs while signed out.
 *
 * Auth events can arrive back to back (an initial session and a sign-in, or a sign-in right before
 * a sign-out), so every operation below runs strictly after the previous one has finished. That
 * keeps exactly one engine alive and makes sure a wipe is never followed by a stale start.
 */
import { onlineManager } from '@tanstack/react-query';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { describeError, logger } from '../logger';
import { getDeviceId } from './deviceId';
import { createSyncEngine, type SyncEngine } from './engine';
import { kvLedgerStorage } from './ledger';
import { clearDataOwner, readDataOwner, writeDataOwner } from './owner';
import { syncedStores } from './registry';
import { useSyncStatusStore } from './status';
import { createSupabaseTransport } from './transport';
import type { Connectivity, Lifecycle } from './types';

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

let tail: Promise<unknown> = Promise.resolve();

/** Runs `operation` after every operation queued before it has settled. */
function inOrder<T>(operation: () => Promise<T>): Promise<T> {
  const result = tail.then(operation);
  tail = result.catch(() => undefined);
  return result;
}

/**
 * Wipes local user data, the sync ledger and the owner marker. Stop the engine first. Removals
 * are synchronous (the Keychain copy of personal details is cleared through its own ordered
 * queue), so nothing written by the next sign-in can be deleted by a late removal.
 */
function wipeLocalData(): void {
  for (const store of syncedStores()) {
    try {
      store.reset();
    } catch (error) {
      logger.error('Could not reset a user store', {
        collection: store.adapter.collection,
        ...describeError(error),
      });
    }
  }
  kvLedgerStorage.remove();
  clearDataOwner();
  useSyncStatusStore.getState().reset();
}

async function stopEngine(): Promise<void> {
  const current = engine;
  engine = null;
  engineUser = null;
  await current?.stop();
}

async function flushEngine(timeoutMs: number): Promise<boolean> {
  const current = engine;
  if (!current) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([current.flush().then(() => true as const), timeout]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function startEngine(userId: string): Promise<void> {
  if (engine && engineUser === userId) return;
  await stopEngine();

  const stores = syncedStores();
  if (stores.length === 0) {
    throw new Error('No synced stores are registered; import "@/stores" before starting sync.');
  }

  const owner = readDataOwner();
  if (owner && owner !== userId) {
    logger.warn('Local user data belonged to another account; clearing it');
    wipeLocalData();
  }
  writeDataOwner(userId);

  const instance = createSyncEngine({
    userId,
    deviceId: getDeviceId(),
    transport: createSupabaseTransport(userId),
    adapters: stores.map((store) => store.adapter),
    storage: kvLedgerStorage,
    connectivity,
    lifecycle,
    onStatus: (status) => useSyncStatusStore.getState().set(status),
  });
  engine = instance;
  engineUser = userId;
  // Begin on the next macrotask: an auth change queued in the same tick (a sign-out right after
  // the sign-in) then replaces this engine before it sends anything. Starting also waits for every
  // store to load, which can take a moment for Keychain-backed ones, so it is not awaited here.
  setTimeout(() => {
    if (engine !== instance) return;
    instance.start().catch((error: unknown) => {
      logger.error('Sync could not start', describeError(error));
    });
  }, 0);
}

/**
 * Starts syncing for `userId`. If the data on this device belongs to a different account (a
 * sign-out that never finished), it is wiped first so it can never reach this account.
 */
export function startSync(userId: string): Promise<void> {
  return inOrder(() => startEngine(userId));
}

/** Stops syncing. Pending changes stay in the outbox for the next start. */
export function stopSync(): Promise<void> {
  return inOrder(stopEngine);
}

/** Pushes pending changes now. Resolves false if that did not finish within `timeoutMs`. */
export function flushSync(timeoutMs = 5000): Promise<boolean> {
  return flushEngine(timeoutMs);
}

/** Pulls and pushes now, e.g. from pull-to-refresh. */
export function syncNow(): Promise<void> {
  return engine?.syncNow() ?? Promise.resolve();
}

/**
 * Sign-out: send what is still pending (briefly, best effort), then stop and wipe everything this
 * account left on the device.
 */
export function signOutCleanup(options: { flushTimeoutMs?: number } = {}): Promise<void> {
  return inOrder(async () => {
    const flushed = await flushEngine(options.flushTimeoutMs ?? 3000);
    if (!flushed) logger.warn('Signed out with unsynced changes');
    await stopEngine();
    wipeLocalData();
  });
}

/** Account deletion: the server data is gone, so stop and wipe without pushing anything. */
export function accountDeletedCleanup(): Promise<void> {
  return inOrder(async () => {
    await stopEngine();
    wipeLocalData();
  });
}
