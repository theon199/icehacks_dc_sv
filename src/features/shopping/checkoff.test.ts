import Storage from 'expo-sqlite/kv-store';

import { storageKey } from '@/lib/storage/kv';
import { selectIsChecked, useShoppingStore } from '@/stores/shopping';

import { INGREDIENTS, RECIPES, pantryItem } from './__fixtures__/catalog';
import { buildPlannedList } from './buildList';
import {
  addExtra,
  extraKey,
  removeExtras,
  selectExtrasFor,
  useShoppingExtrasStore,
} from './extrasStore';

jest.mock('expo-crypto', () => ({
  randomUUID: () => (jest.requireActual('crypto') as { randomUUID: () => string }).randomUUID(),
}));

const at = '2026-11-11T10:00:00.000Z';

/** Simulates an app restart: the stored copy is read back into a fresh in-memory state. */
async function restart(
  store: typeof useShoppingStore | typeof useShoppingExtrasStore,
  key: string,
) {
  const saved = Storage.getItemSync(storageKey(key));
  store.getState().reset();
  if (saved !== null) Storage.setItemSync(storageKey(key), saved);
  await store.persist.rehydrate();
}

beforeEach(() => {
  Storage.clearSync();
  useShoppingStore.getState().reset();
  useShoppingExtrasStore.getState().reset();
});

describe('check-off persistence', () => {
  it('keeps ticks across a restart', async () => {
    useShoppingStore.getState().toggle('i:onion', at);
    useShoppingStore.getState().toggle('i:rice', at);
    useShoppingStore.getState().toggle('i:rice', at);
    await restart(useShoppingStore, 'user.shopping');
    const state = useShoppingStore.getState();
    expect(selectIsChecked('i:onion')(state)).toBe(true);
    expect(selectIsChecked('i:rice')(state)).toBe(false);
  });

  it('ticks follow the item when the list is rebuilt with a different pantry', () => {
    const meals = [
      { date: '2026-11-12', meal: 'dinner', recipeId: 'test:curry', servings: 2 },
    ] as const;
    const base = { meals, recipes: RECIPES, ingredients: INGREDIENTS, portion: 1 };
    const before = buildPlannedList({ ...base, pantry: [] });
    const rice = before.items.find((item) => item.ingredientId === 'rice');
    useShoppingStore.getState().toggle(rice?.key ?? '', at);

    const after = buildPlannedList({ ...base, pantry: [pantryItem('p', 'rice', 50, 'g')] });
    const riceAfter = after.items.find((item) => item.ingredientId === 'rice');
    expect(riceAfter?.amounts[0]?.quantity).toBe(150);
    expect(selectIsChecked(riceAfter?.key ?? '')(useShoppingStore.getState())).toBe(true);
  });

  it('can untick everything at once', () => {
    useShoppingStore.getState().toggle('i:onion', at);
    useShoppingStore.getState().toggle(extraKey('x1'), at);
    useShoppingStore.getState().clear();
    expect(useShoppingStore.getState().checked).toEqual({});
  });
});

describe('hand-added extras', () => {
  it('adds trimmed names once, ignoring case and spacing', () => {
    let extras = addExtra({}, '  Dish   soap ', { id: 'a', at });
    extras = addExtra(extras, 'dish soap', { id: 'b', at });
    extras = addExtra(extras, '   ', { id: 'c', at });
    expect(Object.values(extras)).toEqual([{ id: 'a', name: 'Dish soap', addedAt: at }]);
    expect(removeExtras(extras, ['a'])).toEqual({});
    expect(removeExtras(extras, ['nope'])).toBe(extras);
  });

  it('keys extras apart from plan items', () => {
    expect(extraKey('a')).toBe('x:a');
  });

  it('persist for their owner and are hidden from, then dropped for, another account', async () => {
    const store = useShoppingExtrasStore;
    store.getState().claim('person-1');
    store.getState().add('Candles', at);
    await restart(store, 'user.shopping_extras');
    expect(selectExtrasFor('person-1')(store.getState()).map((e) => e.name)).toEqual(['Candles']);

    expect(selectExtrasFor('person-2')(store.getState())).toEqual([]);
    expect(selectExtrasFor(null)(store.getState())).toEqual([]);
    store.getState().claim('person-2');
    expect(store.getState().extras).toEqual({});
  });
});
