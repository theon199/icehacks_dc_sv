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

/** Flush functions of throttled storages that hold a write not yet on disk. */
const pendingFlushes = new Set<() => void>();
let watchingAppState = false;

/** Writes every deferred store write to disk now. Safe to call at any time. */
export function flushPendingWrites(): void {
  for (const flush of [...pendingFlushes]) flush();
}

/** Deferred writes go to disk as soon as the app leaves the foreground, where it can be killed. */
function watchAppState(): void {
  if (watchingAppState) return;
  watchingAppState = true;
  AppState.addEventListener('change', (state) => {
    if (state !== 'active') flushPendingWrites();
  });
}

/**
 * Wraps persist storage so a burst of state changes costs one write: the first change starts a
 * window of `windowMs`, later changes in the window replace the pending value, and the latest
 * value is written when the window ends (or earlier through `flushPendingWrites`, which also runs
 * when the app goes to the background). Reads see the pending value, and a removal discards it,
 * so a wipe is never undone by a late write.
 */
export function throttleWrites<P>(
  storage: PersistStorage<P> | undefined,
  windowMs: number,
): PersistStorage<P> | undefined {
  if (!storage) return undefined;
  const inner = storage;
  const pending = new Map<string, StorageValue<P>>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  function cancel(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    pendingFlushes.delete(flush);
  }

  function write(name: string, value: StorageValue<P>): void {
    const report = (error: unknown) =>
      logger.warn('Could not save a store', { store: name, message: String(error) });
    try {
      const result: unknown = inner.setItem(name, value);
      if (result instanceof Promise) result.catch(report);
    } catch (error) {
      report(error);
    }
  }

  function flush(): void {
    cancel();
    const writes = [...pending];
    pending.clear();
    for (const [name, value] of writes) write(name, value);
  }

  return {
    getItem: (name) => pending.get(name) ?? inner.getItem(name),
    setItem: (name, value) => {
      pending.set(name, value);
      if (timer) return;
      watchAppState();
      pendingFlushes.add(flush);
      timer = setTimeout(flush, windowMs);
    },
    removeItem: (name) => {
      pending.delete(name);
      if (pending.size === 0) cancel();
      return inner.removeItem(name);
    },
  };
}
