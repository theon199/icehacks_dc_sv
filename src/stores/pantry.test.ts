import {
  addPantryItem,
  MAX_PANTRY_ITEMS,
  pantrySync,
  removePantryItems,
  selectPantryIngredientIds,
  selectPantryItems,
  selectPantryShelves,
  updatePantryItem,
  usePantryStore,
  type PantryItem,
} from './pantry';

jest.mock('expo-crypto', () => ({
  randomUUID: () => (jest.requireActual('crypto') as { randomUUID: () => string }).randomUUID(),
}));

const at = '2026-11-11T10:00:00.000Z';

beforeEach(() => usePantryStore.getState().reset());

describe('pantry transitions', () => {
  it('adds items and tops up the same ingredient in the same unit', () => {
    let items = addPantryItem(
      {},
      { ingredientId: 'rice', name: 'Rice', qty: 1, unit: 'kg', category: 'grain' },
      { id: 'a', at },
    );
    items = addPantryItem(
      items,
      { ingredientId: 'rice', name: 'basmati', qty: 2, unit: 'kg' },
      { id: 'b', at },
    );
    expect(Object.keys(items)).toEqual(['a']);
    expect(items.a?.qty).toBe(3);
    items = addPantryItem(
      items,
      { ingredientId: 'rice', name: 'rice', qty: 1, unit: 'cup' },
      { id: 'c', at },
    );
    expect(Object.keys(items)).toEqual(['a', 'c']);
  });

  it('matches free-text items by normalised name', () => {
    let items = addPantryItem({}, { name: 'Sea  Salt' }, { id: 'a', at });
    items = addPantryItem(items, { name: 'sea salt' }, { id: 'b', at });
    expect(Object.keys(items)).toEqual(['a']);
    expect(items.a?.qty).toBeNull();
  });

  it('ignores invalid input and a full pantry', () => {
    const empty = {};
    expect(addPantryItem(empty, { name: '   ' }, { id: 'a', at })).toBe(empty);
    const full: Record<string, PantryItem> = {};
    for (let i = 0; i < MAX_PANTRY_ITEMS; i += 1) {
      full[`i${i}`] = {
        id: `i${i}`,
        ingredientId: null,
        name: `item ${i}`,
        qty: null,
        unit: null,
        category: 'other',
        addedAt: at,
        expiresAt: null,
      };
    }
    expect(addPantryItem(full, { name: 'one more' }, { id: 'x', at })).toBe(full);
  });

  it('updates and removes without touching unrelated items', () => {
    const items = addPantryItem(
      {},
      { name: 'milk', qty: 1, unit: 'l', category: 'dairy' },
      { id: 'm', at },
    );
    expect(updatePantryItem(items, 'm', { qty: 1 })).toBe(items);
    expect(updatePantryItem(items, 'm', { qty: -1 })).toBe(items);
    expect(updatePantryItem(items, 'm', { qty: 2 }).m?.qty).toBe(2);
    expect(removePantryItems(items, ['nope'])).toBe(items);
    expect(removePantryItems(items, ['m'])).toEqual({});
  });
});

describe('pantry selectors', () => {
  it('groups by shelf in category order and lists ingredient ids', () => {
    const store = usePantryStore.getState();
    store.addMany([
      { name: 'yogurt', category: 'dairy', ingredientId: 'greek_yogurt' },
      { name: 'onion', category: 'produce', ingredientId: 'onion' },
      { name: 'apple', category: 'produce' },
    ]);
    const state = usePantryStore.getState();
    expect(selectPantryItems(state).map((i) => i.name)).toEqual(['apple', 'onion', 'yogurt']);
    expect(selectPantryItems(state)).toBe(selectPantryItems(usePantryStore.getState()));
    expect(selectPantryShelves(state).map((s) => s.category)).toEqual(['produce', 'dairy']);
    expect([...selectPantryIngredientIds(state)].sort()).toEqual(['greek_yogurt', 'onion']);
  });
});

describe('pantrySync', () => {
  it('maps items to documents and applies remote upserts and deletions', () => {
    usePantryStore.getState().add({ name: 'oats', category: 'grain' }, at);
    const [id] = Object.keys(usePantryStore.getState().items);
    expect(pantrySync.getDocs().get(id as string)).toMatchObject({ name: 'oats' });

    const remote: PantryItem = {
      id: 'r1',
      ingredientId: 'lentil',
      name: 'lentils',
      qty: 500,
      unit: 'g',
      category: 'legume',
      addedAt: at,
      expiresAt: null,
    };
    const result = pantrySync.applyRemote({
      upserts: [
        { docId: 'r1', data: remote },
        { docId: 'bad', data: { name: 1 } },
      ],
      deletes: [id as string],
    });
    expect(result.rejected).toEqual(['bad']);
    expect(Object.keys(usePantryStore.getState().items)).toEqual(['r1']);
  });
});
