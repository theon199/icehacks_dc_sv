/**
 * Typed, validated key/value storage on top of `expo-sqlite/kv-store`.
 *
 * Values are JSON-encoded and checked with a zod schema on read; anything that fails validation is
 * dropped rather than trusted. Use it for small preferences and flags. Larger or queryable user
 * data belongs in proper tables.
 */
import Storage from 'expo-sqlite/kv-store';
import type { z } from 'zod';
import { createJSONStorage, type StateStorage } from 'zustand/middleware';

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
