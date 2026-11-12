import Storage from 'expo-sqlite/kv-store';
import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { storageKey } from '@/lib/storage/kv';

import { createSelector, singletonRecord } from './memo';
import {
  runMigrations,
  securePersistStorage,
  versionedPersist,
  waitForHydration,
} from './persistence';

interface CounterState {
  count: number;
  label: string;
}

function counterStore(
  name: string,
  version: number,
  migrations?: Record<number, (s: unknown) => unknown>,
) {
  return create<CounterState>()(
    persist(
      () => ({ count: 0, label: 'default' }),
      versionedPersist({
        name,
        version,
        schema: z.object({ count: z.number().int(), label: z.string() }),
        partialize: (state) => ({ count: state.count, label: state.label }),
        ...(migrations ? { migrations } : {}),
      }),
    ),
  );
}

const writeStored = (name: string, state: unknown, version: number) =>
  Storage.setItemSync(storageKey(name), JSON.stringify({ state, version }));

beforeEach(() => Storage.clearSync());

describe('versionedPersist', () => {
  it('restores valid stored state', () => {
    writeStored('test.valid', { count: 3, label: 'x' }, 1);
    expect(counterStore('test.valid', 1).getState()).toMatchObject({ count: 3, label: 'x' });
  });

  it('drops stored state that fails validation', () => {
    writeStored('test.invalid', { count: 'three', label: 'x' }, 1);
    expect(counterStore('test.invalid', 1).getState()).toMatchObject({
      count: 0,
      label: 'default',
    });
  });

  it('migrates step by step from an older version', () => {
    writeStored('test.migrate', { total: 5 }, 1);
    const store = counterStore('test.migrate', 3, {
      1: (old) => ({ count: (old as { total: number }).total }),
      2: (old) => ({ ...(old as object), label: 'migrated' }),
    });
    expect(store.getState()).toMatchObject({ count: 5, label: 'migrated' });
    const saved = JSON.parse(Storage.getItemSync(storageKey('test.migrate')) ?? '{}');
    expect(saved).toMatchObject({ version: 3, state: { count: 5, label: 'migrated' } });
  });

  it('starts fresh when no migration path exists', () => {
    writeStored('test.nopath', { count: 9, label: 'old' }, 1);
    expect(counterStore('test.nopath', 2).getState()).toMatchObject({ count: 0 });
  });

  it('runMigrations returns undefined for a gap in the chain', () => {
    expect(runMigrations({ a: 1 }, 1, 3, { 1: (s) => s })).toBeUndefined();
    expect(runMigrations({ a: 1 }, 2, 2, {})).toEqual({ a: 1 });
  });
});

describe('securePersistStorage', () => {
  it('round-trips through the Keychain under a Famara key', async () => {
    const storage = securePersistStorage<{ secret: number }>();
    await storage.setItem('user.test', { state: { secret: 42 }, version: 1 });
    expect(await storage.getItem('user.test')).toEqual({ state: { secret: 42 }, version: 1 });
    expect(await SecureStore.getItemAsync('famara.user.test')).toContain('42');
    await storage.removeItem('user.test');
    expect(await storage.getItem('user.test')).toBeNull();
  });

  it('drops unreadable content instead of failing forever', async () => {
    await SecureStore.setItemAsync('famara.user.broken', '{not json');
    const storage = securePersistStorage<unknown>();
    expect(await storage.getItem('user.broken')).toBeNull();
    expect(await SecureStore.getItemAsync('famara.user.broken')).toBeNull();
  });
});

describe('waitForHydration', () => {
  it('retries a failed hydration until it succeeds', async () => {
    jest.useFakeTimers();
    let hydrated = false;
    const listeners = new Set<() => void>();
    const rehydrate = jest.fn(async () => {
      if (rehydrate.mock.calls.length >= 2) {
        hydrated = true;
        listeners.forEach((listener) => listener());
      }
    });
    const store = {
      persist: {
        hasHydrated: () => hydrated,
        onFinishHydration: (listener: () => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        rehydrate,
      },
    };
    const done = jest.fn();
    void waitForHydration(store).then(done);
    await jest.advanceTimersByTimeAsync(1000);
    expect(done).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(2000);
    expect(done).toHaveBeenCalled();
    expect(rehydrate).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });
});

describe('memo helpers', () => {
  it('recomputes only when the input slice changes', () => {
    const compute = jest.fn((items: number[]) => items.map((n) => n * 2));
    const select = createSelector((state: { items: number[] }) => state.items, compute);
    const items = [1, 2];
    const first = select({ items });
    expect(select({ items })).toBe(first);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(select({ items: [1, 2] })).not.toBe(first);
  });

  it('keeps a singleton record stable for the same value', () => {
    const toRecord = singletonRecord<{ a: number }>('main');
    const value = { a: 1 };
    expect(toRecord(value)).toBe(toRecord(value));
    expect(toRecord(value)).toEqual({ main: value });
  });
});
