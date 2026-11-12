/**
 * Which local stores hold per-account data. Stores register themselves here (see
 * `src/stores/userData.ts`), so sync stays independent of any particular store: the session syncs
 * every registered collection and resets every registered store when the account signs out.
 */
import type { SyncCollectionAdapter } from './types';

export interface SyncedStore {
  /** How the engine reads and writes the store's documents. */
  adapter: SyncCollectionAdapter;
  /** Returns the store to its defaults and deletes its persisted copy. */
  reset(): void;
}

const registered = new Map<string, SyncedStore>();

/**
 * Adds a store to sync and to sign-out cleanup. Registering a collection name again replaces the
 * earlier entry. Returns a function that removes the registration (for tests).
 */
export function registerSyncedStore(store: SyncedStore): () => void {
  const name = store.adapter.collection;
  registered.set(name, store);
  return () => {
    if (registered.get(name) === store) registered.delete(name);
  };
}

let syncRunning: () => boolean = () => false;

/**
 * Set by the sync session: how to tell whether its engine is running. Asked on every check rather
 * than stored as a flag, so an engine that stops on its own (another account's session) counts as
 * stopped at once.
 */
export function setSyncRunning(running: () => boolean): void {
  syncRunning = running;
}

/**
 * Whether an engine is watching the registered stores. Resetting a store then reads as the person
 * deleting everything, so resets must go through the session (sign-out), never directly.
 */
export function isSyncRunning(): boolean {
  return syncRunning();
}

/** Every registered store, in registration order. */
export function syncedStores(): readonly SyncedStore[] {
  return [...registered.values()];
}
