import { addPantryItem } from '@/stores/pantry';

import {
  draftFromDetections,
  draftReducer,
  parseQty,
  selectedItems,
  toNewPantryItems,
  type DraftItem,
  type IngredientMatchInfo,
} from './pantryDraft';

const detections = [
  { name: 'eggs', quantity: 6, unit: 'piece' as const, confidence: 0.92 },
  { name: 'spinach', quantity: null, unit: null, confidence: 0.71 },
  { name: 'mystery sauce', quantity: 1, unit: 'jar' as const, confidence: 0.3 },
];

describe('pantry draft', () => {
  it('starts with confident items ticked and names capitalised', () => {
    const draft = draftFromDetections(detections);
    expect(draft.map((item) => [item.name, item.selected])).toEqual([
      ['Eggs', true],
      ['Spinach', true],
      ['Mystery sauce', false],
    ]);
    expect(new Set(draft.map((item) => item.key)).size).toBe(3);
  });

  it('edits, toggles, removes and adds items', () => {
    let draft = draftFromDetections(detections);
    const [eggs, spinach, sauce] = draft as [DraftItem, DraftItem, DraftItem];
    draft = draftReducer(draft, { type: 'toggle', key: sauce.key });
    draft = draftReducer(draft, { type: 'rename', key: sauce.key, name: 'Tomato sauce' });
    draft = draftReducer(draft, { type: 'setQty', key: eggs.key, qty: 12 });
    draft = draftReducer(draft, { type: 'remove', key: spinach.key });
    draft = draftReducer(draft, { type: 'add', key: 'mine-1', name: '  Lemons ' });
    expect(draft.map((item) => [item.name, item.qty, item.selected])).toEqual([
      ['Eggs', 12, true],
      ['Tomato sauce', 1, true],
      ['Lemons', null, true],
    ]);
  });

  it('clears the unit when the amount is cleared, and ignores bad amounts', () => {
    const draft = draftFromDetections(detections);
    const key = (draft[0] as DraftItem).key;
    const cleared = draftReducer(draft, { type: 'setQty', key, qty: null });
    expect(cleared[0]).toMatchObject({ qty: null, unit: null });
    const negative = draftReducer(draft, { type: 'setQty', key, qty: -2 });
    expect(negative[0]).toMatchObject({ qty: null });
  });

  it('returns the same list for no-op actions', () => {
    const draft = draftFromDetections(detections);
    expect(draftReducer(draft, { type: 'toggle', key: 'nope' })).toBe(draft);
    expect(draftReducer(draft, { type: 'add', key: 'x', name: '   ' })).toBe(draft);
    const all = draftReducer(draft, { type: 'selectAll', selected: true });
    expect(draftReducer(all, { type: 'selectAll', selected: true })).toBe(all);
  });

  it('reads typed amounts', () => {
    expect(parseQty('2')).toBe(2);
    expect(parseQty('1,5')).toBe(1.5);
    expect(parseQty('1/2')).toBe(0.5);
    expect(parseQty('')).toBeNull();
    expect(parseQty('lots')).toBeUndefined();
    expect(parseQty('0')).toBeUndefined();
    expect(parseQty('1/0')).toBeUndefined();
  });
});

describe('adding a reviewed draft to the pantry', () => {
  const matches = new Map<string, IngredientMatchInfo | null>([
    ['egg', { id: 'egg', name: 'egg', category: 'protein' }],
    ['spinach', { id: 'spinach', name: 'spinach', category: 'produce' }],
    ['mystery sauce', null],
  ]);

  it('carries matched ids and shelves, and keeps unmatched items as free text', () => {
    const draft = draftReducer(draftFromDetections(detections), {
      type: 'selectAll',
      selected: true,
    });
    expect(toNewPantryItems(draft, matches)).toEqual([
      { ingredientId: 'egg', name: 'Eggs', qty: 6, unit: 'piece', category: 'protein' },
      { ingredientId: 'spinach', name: 'Spinach', qty: null, unit: null, category: 'produce' },
      { ingredientId: null, name: 'Mystery sauce', qty: 1, unit: 'jar', category: 'other' },
    ]);
  });

  it('leaves out unticked and blank items', () => {
    let draft = draftFromDetections(detections);
    draft = draftReducer(draft, { type: 'rename', key: (draft[1] as DraftItem).key, name: ' ' });
    expect(selectedItems(draft).map((item) => item.name)).toEqual(['Eggs']);
    expect(toNewPantryItems(draft, matches)).toHaveLength(1);
  });

  it('produces entries the pantry store accepts and merges with what is there', () => {
    const draft = draftFromDetections(detections);
    const entries = toNewPantryItems(draft, matches);
    let items: ReturnType<typeof addPantryItem> = {};
    entries.forEach((entry, index) => {
      items = addPantryItem(items, entry, { id: `a${index}`, at: '2026-11-11T10:00:00.000Z' });
    });
    // The same eggs snapped again top up the existing item instead of duplicating it.
    items = addPantryItem(items, entries[0]!, { id: 'again', at: '2026-11-11T11:00:00.000Z' });
    const stored = Object.values(items);
    expect(stored).toHaveLength(2);
    expect(stored.find((item) => item.ingredientId === 'egg')).toMatchObject({ qty: 12 });
  });
});
