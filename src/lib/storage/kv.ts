/**
 * Typed, validated key/value storage on top of `expo-sqlite/kv-store`.
 *
 * Values are JSON-encoded and checked with a zod schema on read; anything that fails validation is
 * dropped rather than trusted. Use it for small preferences and flags. Larger or queryable user
 * data belongs in proper tables.
 */
import Storage from 'expo-sqlite/kv-store';
import { AppState } from 'react-native';
import type { z } from 'zod';
import {
  createJSONStorage,
  type PersistStorage,
  type StateStorage,
  type StorageValue,
} from 'zustand/middleware';

import { logger } from '../logger';

const PREFIX = 'famara:';

export const storageKey = (name: string) => `${PREFIX}${name}`;

function decode<S extends z.ZodType>(
  name: string,
  raw: string | null,
  schema: S,
): z.infer<S> | null {
  if (raw == null) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
    logger.warn('Dropping stored value that failed validation', { key: name });
  } catch {
    logger.warn('Dropping stored value that is not valid JSON', { key: name });
  }
  return null;
}

export interface KvKey<T> {
  readonly name: string;
  get(): Promise<T | null>;
  set(value: T): Promise<void>;
  remove(): Promise<void>;
  getSync(): T | null;
  setSync(value: T): void;
}

/**
 * Declares a storage key with its schema once, then reads and writes it with full typing:
 *
 *   const lastTab = defineKvKey('ui.lastTab', z.enum(['discover', 'search']));
 *   await lastTab.set('search');
 */
export function defineKvKey<S extends z.ZodType>(name: string, schema: S): KvKey<z.infer<S>> {
  const key = storageKey(name);
  const encode = (value: z.infer<S>) => JSON.stringify(schema.parse(value));
  return {
    name,
    async get() {
      const raw = await Storage.getItem(key);
      const value = decode(name, raw, schema);
      if (raw != null && value == null) await Storage.removeItem(key);
      return value;
    },
    async set(value) {
      await Storage.setItem(key, encode(value));
    },
    async remove() {
      await Storage.removeItem(key);
    },
    getSync() {
      const raw = Storage.getItemSync(key);
      const value = decode(name, raw, schema);
      if (raw != null && value == null) Storage.removeItemSync(key);
      return value;
    },
    setSync(value) {
      Storage.setItemSync(key, encode(value));
    },
  };
}

/**
 * Zustand `persist` storage backed by the same SQLite key/value store. Reads are synchronous so
 * persisted stores are hydrated before the first render.
 */
export const zustandKvStorage: StateStorage = {
  getItem: (name) => Storage.getItemSync(storageKey(name)),
  setItem: (name, value) => Storage.setItemSync(storageKey(name), value),
  removeItem: (name) => {
    Storage.removeItemSync(storageKey(name));
  },
};

/** Ready-made JSON storage for `persist({ storage: persistStorage() })`. */
export function persistStorage<T>() {
  return createJSONStorage<T>(() => zustandKvStorage);
}

// -------------------------------------------------------------------------------------------------
// Deferred writes for stores that change in bursts

/** A deferred write that failed is tried again after this long, doubling up to the cap. */
const RETRY_MAX_MS = 60_000;

/** Flush functions of throttled storages that hold a write not yet on disk. */
const pendingFlushes = new Set<() => void>();
let watchingAppState = false;

/**
 * Writes every deferred store write to disk now. Every pending write is attempted; if any of them
 * fails, it stays pending (to be tried again later) and the first error is thrown once all were
 * attempted. Callers that record something assuming the stores are on disk (the sync ledger) must
 * not record it when this throws.
 */
export function flushPendingWrites(): void {
  let failure: { error: unknown } | null = null;
  for (const flush of [...pendingFlushes]) {
    try {
      flush();
    } catch (error) {
      failure ??= { error };
    }
  }
  if (failure) throw failure.error;
}

/** Deferred writes go to disk as soon as the app leaves the foreground, where it can be killed. */
function watchAppState(): void {
  if (watchingAppState) return;
  watchingAppState = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') return;
    try {
      flushPendingWrites();
    } catch {
      // Already reported per store; the failed writes stay pending and are retried.
    }
  });
}

/**
 * Wraps persist storage so a burst of state changes costs one write: the first change starts a
 * window of `windowMs`, later changes in the window replace the pending value, and the latest
 * value is written when the window ends (or earlier through `flushPendingWrites`, which also runs
 * when the app goes to the background). Reads see the pending value, and a removal discards it,
 * so a wipe is never undone by a late write.
 *
 * A value the storage refuses (disk full, I/O error) is not dropped: it stays pending, is retried
 * with a growing delay, and makes `flushPendingWrites` throw until it is on disk.
 */
export function throttleWrites<P>(
  storage: PersistStorage<P> | undefined,
  windowMs: number,
): PersistStorage<P> | undefined {
  if (!storage) return undefined;
  const inner = storage;
  const pending = new Map<string, StorageValue<P>>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** Consecutive flushes that left a write behind; sets the retry delay. */
  let failedFlushes = 0;
  /**
   * Bumped by every set and removal of a name, so a write that fails late is put back only while
   * nothing newer (a later value, a wipe) has replaced it.
   */
  const versions = new Map<string, number>();
  let counter = 0;
  const bump = (name: string) => versions.set(name, (counter += 1));

  function cancel(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    failedFlushes = 0;
    pendingFlushes.delete(flush);
  }

  function arm(delayMs: number): void {
    if (timer) return;
    watchAppState();
    pendingFlushes.add(flush);
    timer = setTimeout(() => {
      timer = null;
      try {
        flush();
      } catch {
        // Already reported; `flush` scheduled the next attempt.
      }
    }, delayMs);
  }

  function retryLater(): void {
    failedFlushes += 1;
    arm(Math.min(RETRY_MAX_MS, windowMs * 2 ** Math.min(failedFlushes, 16)));
  }

  /** Puts back a value whose write failed, unless a newer value or a removal replaced it. */
  function keep(name: string, value: StorageValue<P>, error: unknown): void {
    logger.warn('Could not save a store; will try again', {
      store: name,
      message: String(error),
    });
    if (!pending.has(name)) pending.set(name, value);
  }

  function flush(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    pendingFlushes.delete(flush);
    const writes = [...pending];
    pending.clear();
    let failure: { error: unknown } | null = null;
    for (const [name, value] of writes) {
      try {
        const result: unknown = inner.setItem(name, value);
        if (result instanceof Promise) {
          const version = versions.get(name);
          result.catch((error: unknown) => {
            if (versions.get(name) !== version) return;
            keep(name, value, error);
            retryLater();
          });
        }
      } catch (error) {
        failure ??= { error };
        keep(name, value, error);
      }
    }
    if (failure) {
      retryLater();
      throw failure.error;
    }
    failedFlushes = 0;
  }

  return {
    getItem: (name) => pending.get(name) ?? inner.getItem(name),
    setItem: (name, value) => {
      bump(name);
      pending.set(name, value);
      arm(windowMs);
    },
    removeItem: (name) => {
      bump(name);
      pending.delete(name);
      if (pending.size === 0) cancel();
      return inner.removeItem(name);
    },
  };
}
