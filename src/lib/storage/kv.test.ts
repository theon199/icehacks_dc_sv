import Storage from 'expo-sqlite/kv-store';
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { defineKvKey, persistStorage, storageKey } from './kv';

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
