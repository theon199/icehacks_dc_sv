/**
 * The flat row model behind the pantry's shelf cards. Each shelf is one white card: a heading row
 * that opens it, then rows of up to `TILES_PER_ROW` item tiles, the last of which closes it. Keeping
 * the cards as list rows lets a pantry of hundreds of items recycle like any other long list.
 */
import type { IngredientCategory } from '@/lib/catalog';
import type { PantryItem } from '@/stores/pantry';

import { SHELF_TITLES } from './shelves';

export const TILES_PER_ROW = 4;

export type ShelfRow =
  | {
      readonly type: 'shelf';
      readonly key: string;
      readonly category: IngredientCategory;
      readonly title: string;
      readonly count: number;
    }
  | {
      readonly type: 'tiles';
      readonly key: string;
      readonly items: readonly PantryItem[];
      /** Last row of its shelf card. */
      readonly closes: boolean;
    };

export interface Shelf {
  readonly category: IngredientCategory;
  readonly items: readonly PantryItem[];
}

export function shelfRows(shelves: readonly Shelf[]): ShelfRow[] {
  const rows: ShelfRow[] = [];
  for (const { category, items } of shelves) {
    if (items.length === 0) continue;
    rows.push({
      type: 'shelf',
      key: `shelf:${category}`,
      category,
      title: SHELF_TITLES[category],
      count: items.length,
    });
    for (let start = 0; start < items.length; start += TILES_PER_ROW) {
      const chunk = items.slice(start, start + TILES_PER_ROW);
      rows.push({
        type: 'tiles',
        // Keyed by the first item so a row keeps its identity while later shelves change.
        key: `tiles:${category}:${chunk[0]?.id ?? start}`,
        items: chunk,
        closes: start + TILES_PER_ROW >= items.length,
      });
    }
  }
  return rows;
}
