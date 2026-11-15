import type { SnapPantryItem } from '@/lib/api/ai';

import { draftFromSweep } from './pantryDraft';
import {
  countByOrigin,
  FRESH_MS,
  freshKeys,
  mergeSweepItems,
  nextFreshExpiry,
  SWEEP_MAX_ITEMS,
  sweepItemLabel,
  type SweepItem,
} from './sweepItems';

const seen = (
  name: string,
  quantity: number | null = null,
  unit: SnapPantryItem['unit'] = null,
  confidence = 0.8,
): SnapPantryItem => ({ name, quantity, unit, confidence });

describe('mergeSweepItems', () => {
  it('lists each food once across batches, newest first', () => {
    const first = mergeSweepItems(
      [],
      [seen('milk', 1, 'carton'), seen('eggs', 10, 'piece')],
      'video',
      100,
    );
    expect(first.added).toEqual(['milk', 'egg']);
    const second = mergeSweepItems(
      first.items,
      [seen('Eggs', 6, 'piece', 0.5), seen('feta'), seen('the milk')],
      'video',
      200,
    );
    expect(second.added).toEqual(['feta']);
    expect(second.items.map((item) => item.name)).toEqual(['Feta', 'Milk', 'Eggs']);
    // The less confident later reading does not replace the first amount.
    expect(second.items.find((item) => item.key === 'egg')?.quantity).toBe(10);
    expect(second.items.find((item) => item.key === 'feta')?.foundAt).toBe(200);
  });

  it('takes a more confident amount, and always an amount the person said', () => {
    const { items } = mergeSweepItems([], [seen('lemons', 1, 'piece', 0.6)], 'video', 0);
    const surer = mergeSweepItems(items, [seen('lemon', 3, 'piece', 0.9)], 'video', 1).items;
    expect(surer[0]).toMatchObject({ quantity: 3, confidence: 0.9, origin: 'video' });
    const said = mergeSweepItems(surer, [seen('lemons', 2, 'piece', 0.7)], 'said', 2);
    expect(said.added).toEqual([]);
    expect(said.items[0]).toMatchObject({ quantity: 2, confidence: 0.9, origin: 'video' });
  });

  it('marks items found in words as said', () => {
    const { items } = mergeSweepItems([], [seen('paneer')], 'said', 0);
    expect(items[0]).toMatchObject({ name: 'Paneer', origin: 'said' });
    expect(countByOrigin(items, 'said')).toBe(1);
    expect(countByOrigin(items, 'video')).toBe(0);
  });

  it('leaves the list alone when a reading adds nothing', () => {
    const { items } = mergeSweepItems([], [seen('milk', 1, 'carton', 0.9)], 'video', 0);
    const again = mergeSweepItems(items, [seen('milk', 2, 'carton', 0.4), seen('  ')], 'video', 5);
    expect(again.items).toEqual(items);
    expect(again.added).toEqual([]);
  });

  it('drops amounts with no unit and caps the list', () => {
    const { items } = mergeSweepItems([], [seen('rice', 0, 'bag')], 'video', 0);
    expect(items[0]).toMatchObject({ quantity: null, unit: null });
    const many = Array.from({ length: SWEEP_MAX_ITEMS + 10 }, (_, i) => seen(`food${i}`));
    expect(mergeSweepItems([], many, 'video', 0).items).toHaveLength(SWEEP_MAX_ITEMS);
  });
});

describe('fresh items', () => {
  const items: SweepItem[] = mergeSweepItems([], [seen('milk')], 'video', 1000).items;

  it('tags an item as new for a moment after it is found', () => {
    expect([...freshKeys(items, 1000 + FRESH_MS - 1)]).toEqual(['milk']);
    expect(freshKeys(items, 1000 + FRESH_MS).size).toBe(0);
    expect(nextFreshExpiry(items, 1500)).toBe(FRESH_MS - 500);
    expect(nextFreshExpiry(items, 1000 + FRESH_MS)).toBeNull();
  });
});

describe('sweepItemLabel', () => {
  it('shows counts plainly and other units after the amount', () => {
    const [feta, milk, eggs] = mergeSweepItems(
      [],
      [seen('feta'), seen('milk', 1, 'carton'), seen('eggs', 10, 'piece')],
      'video',
      0,
    ).items as [SweepItem, SweepItem, SweepItem];
    expect([sweepItemLabel(feta), sweepItemLabel(milk), sweepItemLabel(eggs)]).toEqual([
      'Feta',
      'Milk, 1 carton',
      'Eggs, 10',
    ]);
  });
});

describe('draftFromSweep', () => {
  it('puts video finds first, then what was said, each in the order found', () => {
    let items = mergeSweepItems([], [seen('milk', 1, 'carton', 0.9)], 'video', 0).items;
    items = mergeSweepItems(items, [seen('paneer', null, null, 0.95)], 'said', 1).items;
    items = mergeSweepItems(items, [seen('salsa', null, null, 0.3)], 'video', 2).items;
    expect(
      draftFromSweep(items).map((item) => [item.key, item.name, item.origin, item.selected]),
    ).toEqual([
      ['video-milk', 'Milk', 'video', true],
      ['video-salsa', 'Salsa', 'video', false],
      ['said-paneer', 'Paneer', 'said', true],
    ]);
  });
});
