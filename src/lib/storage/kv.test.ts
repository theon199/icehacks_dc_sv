import Storage from 'expo-sqlite/kv-store';
import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';

import { logger } from '../logger';
import { defineKvKey, flushPendingWrites, persistStorage, storageKey, throttleWrites } from './kv';

const units = defineKvKey('settings.units', z.enum(['us', 'metric']));

describe('defineKvKey', () => {
  beforeEach(() => Storage.clearSync());

  it('round-trips a validated value asynchronously', async () => {
    await units.set('metric');
    expect(await units.get()).toBe('metric');
    await units.remove();
    expect(await units.get()).toBeNull();
  });

  it('round-trips synchronously', () => {
    units.setSync('us');
    expect(units.getSync()).toBe('us');
  });

  it('drops stored values that fail validation', async () => {
    Storage.setItemSync(storageKey('settings.units'), JSON.stringify('imperial'));
    expect(await units.get()).toBeNull();
    expect(Storage.getItemSync(storageKey('settings.units'))).toBeNull();
  });

  it('drops values that are not JSON', () => {
    Storage.setItemSync(storageKey('settings.units'), '{oops');
    expect(units.getSync()).toBeNull();
  });

  it('refuses to write invalid values', async () => {
    await expect(units.set('imperial' as never)).rejects.toThrow();
  });
});

describe('persistStorage', () => {
  beforeEach(() => Storage.clearSync());

  it('persists a zustand store under the Famara prefix', () => {
    const useCounter = create<{ count: number; inc: () => void }>()(
      persist((set) => ({ count: 0, inc: () => set((s) => ({ count: s.count + 1 })) }), {
        name: 'test.counter',
        storage: persistStorage<{ count: number }>(),
        partialize: (s) => ({ count: s.count }),
      }),
    );
    useCounter.getState().inc();
    const raw = Storage.getItemSync(storageKey('test.counter'));
    expect(JSON.parse(raw ?? '{}')).toMatchObject({ state: { count: 1 } });
  });
});

describe('throttleWrites', () => {
  type Value = StorageValue<{ n: number }>;
  const value = (n: number): Value => ({ state: { n }, version: 0 });

  /** A storage whose writes fail while `failing` is set, like a full disk. */
  function flakyStorage() {
    const disk = new Map<string, Value>();
    const control = { failing: false };
    const storage: PersistStorage<{ n: number }> = {
      getItem: (name) => disk.get(name) ?? null,
      setItem: (name, next) => {
        if (control.failing) throw new Error('disk full');
        disk.set(name, next);
      },
      removeItem: (name) => {
        disk.delete(name);
      },
    };
    return { disk, control, storage };
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    try {
      flushPendingWrites();
    } catch {
      // A test that leaves a failing write behind has already checked it.
    }
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('keeps a write the storage refuses, reports it, and retries it later', () => {
    const { disk, control, storage } = flakyStorage();
    const throttled = throttleWrites(storage, 1000);
    if (!throttled) throw new Error('expected a storage');
    control.failing = true;
    throttled.setItem('a', value(1));

    expect(() => flushPendingWrites()).toThrow('disk full');
    expect(disk.has('a')).toBe(false);
    // Still pending: reads see it, and flushing again fails again rather than reporting success.
    expect(throttled.getItem('a')).toEqual(value(1));
    expect(() => flushPendingWrites()).toThrow('disk full');

    // Once the disk recovers, the retry timer writes it without anyone asking.
    control.failing = false;
    jest.advanceTimersByTime(60_000);
    expect(disk.get('a')).toEqual(value(1));
    expect(() => flushPendingWrites()).not.toThrow();
  });

  it('writes every pending value before reporting a failure', () => {
    const good = flakyStorage();
    const bad = flakyStorage();
    const first = throttleWrites(bad.storage, 1000);
    const second = throttleWrites(good.storage, 1000);
    if (!first || !second) throw new Error('expected a storage');
    bad.control.failing = true;
    first.setItem('a', value(1));
    second.setItem('b', value(2));

    expect(() => flushPendingWrites()).toThrow('disk full');
    expect(good.disk.get('b')).toEqual(value(2));
    bad.control.failing = false;
    flushPendingWrites();
    expect(bad.disk.get('a')).toEqual(value(1));
  });

  it('keeps the newest value, and never brings back a failed write after a removal', () => {
    const { disk, control, storage } = flakyStorage();
    const throttled = throttleWrites(storage, 1000);
    if (!throttled) throw new Error('expected a storage');
    control.failing = true;
    throttled.setItem('a', value(1));
    expect(() => flushPendingWrites()).toThrow();
    throttled.setItem('a', value(2));
    control.failing = false;
    flushPendingWrites();
    expect(disk.get('a')).toEqual(value(2));

    control.failing = true;
    throttled.setItem('a', value(3));
    expect(() => flushPendingWrites()).toThrow();
    void throttled.removeItem('a');
    control.failing = false;
    jest.advanceTimersByTime(60_000);
    expect(disk.has('a')).toBe(false);
    expect(throttled.getItem('a')).toBeNull();
  });

  it('puts back a value whose asynchronous write fails and retries it', async () => {
    const disk = new Map<string, Value>();
    let failing = true;
    const storage: PersistStorage<{ n: number }> = {
      getItem: (name) => disk.get(name) ?? null,
      setItem: async (name, next) => {
        await Promise.resolve();
        if (failing) throw new Error('disk full');
        disk.set(name, next);
      },
      removeItem: (name) => {
        disk.delete(name);
      },
    };
    const throttled = throttleWrites(storage, 1000);
    if (!throttled) throw new Error('expected a storage');
    throttled.setItem('a', value(1));
    flushPendingWrites();
    await jest.advanceTimersByTimeAsync(0);
    expect(throttled.getItem('a')).toEqual(value(1));

    failing = false;
    await jest.advanceTimersByTimeAsync(60_000);
    expect(disk.get('a')).toEqual(value(1));
  });
});
