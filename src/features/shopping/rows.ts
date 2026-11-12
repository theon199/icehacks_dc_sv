/**
 * The flat row model the shopping screen's list renders: aisle headings, items (unticked first in
 * each aisle), the hand-added extras, and the collapsible "already in your pantry" section.
 */
import {
  itemText,
  orderForDisplay,
  type AisleGroup,
  type CheckState,
  type ShoppingItem,
} from '@/domain/shopping';
import type { UnitSystem } from '@/domain/units';

import { extraKey, type ExtraItem } from './extrasStore';
import { EXTRAS_TITLE } from './shareText';

export type ShoppingRow =
  | {
      readonly type: 'heading';
      readonly key: string;
      readonly title: string;
      readonly count: number;
    }
  | {
      readonly type: 'check';
      readonly key: string;
      readonly title: string;
      readonly subtitle: string | null;
      readonly checked: boolean;
    }
  | { readonly type: 'pantryToggle'; readonly key: string; readonly count: number }
  | { readonly type: 'pantryItem'; readonly key: string; readonly title: string };

export interface RowsInput {
  readonly groups: readonly AisleGroup[];
  readonly inPantry: readonly ShoppingItem[];
  readonly extras: readonly ExtraItem[];
  readonly checks: CheckState;
  readonly system: UnitSystem;
  readonly showPantry: boolean;
}

function itemSubtitle(item: ShoppingItem): string | null {
  const notes: string[] = [];
  if (item.recipeIds.length > 1) notes.push(`For ${item.recipeIds.length} recipes`);
  if (item.staple && item.pantry === 'none') notes.push('Often already at home');
  return notes.length > 0 ? notes.join(' · ') : null;
}

export function shoppingRows(input: RowsInput): ShoppingRow[] {
  const fmt = { system: input.system } as const;
  const isChecked = (key: string) =>
    Object.prototype.hasOwnProperty.call(input.checks.checked, key);
  const rows: ShoppingRow[] = [];

  for (const group of orderForDisplay(input.groups, input.checks)) {
    rows.push({
      type: 'heading',
      key: `aisle:${group.aisle}`,
      title: group.title,
      count: group.items.length,
    });
    for (const item of group.items) {
      rows.push({
        type: 'check',
        key: item.key,
        title: itemText(item, fmt),
        subtitle: itemSubtitle(item),
        checked: isChecked(item.key),
      });
    }
  }

  if (input.extras.length > 0) {
    rows.push({
      type: 'heading',
      key: 'aisle:extras',
      title: EXTRAS_TITLE,
      count: input.extras.length,
    });
    const extras = input.extras.map((extra) => ({ extra, key: extraKey(extra.id) }));
    const ordered = [
      ...extras.filter(({ key }) => !isChecked(key)),
      ...extras.filter(({ key }) => isChecked(key)),
    ];
    for (const { extra, key } of ordered) {
      rows.push({ type: 'check', key, title: extra.name, subtitle: null, checked: isChecked(key) });
    }
  }

  if (input.inPantry.length > 0) {
    rows.push({ type: 'pantryToggle', key: 'pantry:toggle', count: input.inPantry.length });
    if (input.showPantry) {
      for (const item of input.inPantry) {
        rows.push({ type: 'pantryItem', key: `pantry:${item.key}`, title: itemText(item, fmt) });
      }
    }
  }
  return rows;
}
