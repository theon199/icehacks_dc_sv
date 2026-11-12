/**
 * Persistence for user stores: versioned zustand `persist` options whose stored state is validated
 * with zod on every load, plus Keychain-backed storage for sensitive stores.
 *
 * Each store declares its current `version` and, when its stored shape changes, a migration from
 * every older version to the next. Stored state that is unreadable, fails validation, or comes from
 * a version with no migration path is dropped and the store starts from its defaults.
 */
import * as SecureStore from 'expo-secure-store';
import type { z } from 'zod';
import type { PersistOptions, PersistStorage, StorageValue } from 'zustand/middleware';

import { logger } from '@/lib/logger';
import { persistStorage } from '@/lib/storage/kv';
import { createChunkedSecureStorage } from '@/lib/supabase/secureStorage';

/** Upgrades stored state from version `n` (its key) to `n + 1`. */
export type Migration = (state: unknown) => unknown;

export interface VersionedPersistConfig<S, P> {
  /** Storage key, e.g. `user.pantry`. */
  name: string;
  version: number;
  /** Shape of the persisted part of the state at the current version. */
  schema: z.ZodType<P>;
  partialize: (state: S) => P;
  migrations?: Readonly<Record<number, Migration>>;
  storage?: PersistOptions<S, P>['storage'];
}

/** Runs the migration chain; returns undefined when there is no path to the current version. */
export function runMigrations(
  state: unknown,
  fromVersion: number,
  toVersion: number,
  migrations: Readonly<Record<number, Migration>>,
): unknown {
  let current = state;
  for (let version = fromVersion; version < toVersion; version += 1) {
    const step = migrations[version];
    if (!step) return undefined;
    current = step(current);
  }
  return current;
}

export function versionedPersist<S, P>(config: VersionedPersistConfig<S, P>): PersistOptions<S, P> {
  const migrations = config.migrations ?? {};
  return {
    name: config.name,
    version: config.version,
    storage: config.storage ?? persistStorage<P>(),
    partialize: config.partialize,
    migrate: (persisted, fromVersion) => {
      const migrated = runMigrations(persisted, fromVersion, config.version, migrations);
      if (migrated === undefined && fromVersion < config.version) {
        logger.warn('No migration for stored state; starting fresh', {
          store: config.name,
          fromVersion,
        });
      }
      return migrated as P;
    },
    merge: (persisted, current) => {
      if (persisted == null) return current;
      const parsed = config.schema.safeParse(persisted);
      if (!parsed.success) {
        logger.warn('Dropping stored state that failed validation', { store: config.name });
        return current;
      }
      return { ...current, ...parsed.data };
    },
  };
}

/**
 * Keychain storage for sensitive state. Values never leave this device through backups
 * (`THIS_DEVICE_ONLY`) and stay readable after the first unlock so background work can run.
 *
 * A Keychain failure (for example before the first unlock after a restart) rejects, so hydration
 * fails and can be retried instead of silently starting from empty state. Content that is not
 * valid JSON can never be read back, so it is removed and treated as absent.
 *
 * Long values are written in several Keychain entries, so operations run one at a time: two
 * overlapping writes (or a write and a removal on sign-out) could otherwise interleave.
 */
export function securePersistStorage<P>(): PersistStorage<P> {
  const keychain = createChunkedSecureStorage(SecureStore, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  const key = (name: string) => `famara.${name}`;
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(operation: () => Promise<T>): Promise<T> => {
    const run = queue.then(operation, operation);
    queue = run.catch(() => undefined);
    return run;
  };
  return {
    getItem: (name) =>
      serial(async () => {
        const raw = await keychain.getItem(key(name));
        if (raw == null) return null;
        try {
          return JSON.parse(raw) as StorageValue<P>;
        } catch {
          logger.warn('Dropping unreadable secure state', { store: name });
          await keychain.removeItem(key(name));
          return null;
        }
      }),
    setItem: (name, value) => serial(() => keychain.setItem(key(name), JSON.stringify(value))),
    removeItem: (name) => serial(() => keychain.removeItem(key(name))),
  };
}

interface Rehydratable {
  persist: {
    hasHydrated(): boolean;
    onFinishHydration(listener: () => void): () => void;
    rehydrate(): Promise<void> | void;
  };
}

/**
 * Resolves once an asynchronously persisted store has loaded, retrying a failed load with growing
 * delays (1 s up to 1 min).
 */
export async function waitForHydration(store: Rehydratable): Promise<void> {
  const { persist } = store;
  let delay = 1000;
  while (!persist.hasHydrated()) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(done, delay);
      const unsubscribe = persist.onFinishHydration(done);
      function done() {
        clearTimeout(timer);
        unsubscribe();
        resolve();
      }
    });
    if (persist.hasHydrated()) return;
    await persist.rehydrate();
    delay = Math.min(delay * 2, 60_000);
  }
}
