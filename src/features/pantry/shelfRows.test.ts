import type { PantryItem } from '@/stores/pantry';

import { shelfRows, TILES_PER_ROW } from './shelfRows';

const item = (id: string, category: PantryItem['category']): PantryItem => ({
  id,
  ingredientId: null,
  name: id,
  qty: null,
  unit: null,
  category,
  addedAt: '2026-11-11T10:00:00.000Z',
  expiresAt: null,
});

describe('shelfRows', () => {
  it('opens each shelf with its title and count, then rows of tiles', () => {
    const produce = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => item(id, 'produce'));
    const rows = shelfRows([
      { category: 'produce', items: produce },
      { category: 'grain', items: [item('rice', 'grain')] },
    ]);
    expect(rows.map((row) => row.type)).toEqual(['shelf', 'tiles', 'tiles', 'shelf', 'tiles']);
    expect(rows[0]).toMatchObject({ title: 'Fruit & veg', count: 6 });
    const tiles = rows.filter((row) => row.type === 'tiles');
    expect(tiles.map((row) => row.items.length)).toEqual([TILES_PER_ROW, 2, 1]);
  });

  it('marks only the last tile row of each shelf as closing its card', () => {
    const rows = shelfRows([
      { category: 'produce', items: ['a', 'b', 'c', 'd'].map((id) => item(id, 'produce')) },
      { category: 'dairy', items: ['m', 'n', 'o', 'p', 'q'].map((id) => item(id, 'dairy')) },
    ]);
    const closes = rows.flatMap((row) => (row.type === 'tiles' ? [row.closes] : []));
    expect(closes).toEqual([true, false, true]);
  });

  it('gives every row a unique key and skips empty shelves', () => {
    const rows = shelfRows([
      { category: 'produce', items: [] },
      { category: 'spice', items: ['s1', 's2', 's3', 's4', 's5'].map((id) => item(id, 'spice')) },
    ]);
    expect(rows.some((row) => row.key === 'shelf:produce')).toBe(false);
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });
});
