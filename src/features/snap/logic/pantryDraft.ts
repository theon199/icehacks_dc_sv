/**
 * The editable list of items found in a pantry photo. The person reviews it (fixes names and
 * amounts, unticks what is wrong, adds what was missed) before anything reaches their pantry.
 */
import type { SnapPantryItem } from '@/lib/api/ai';
import type { IngredientCategory } from '@/lib/catalog/types';
import type { NewPantryItem, PantryItem } from '@/stores/pantry';

import { capitalize, nameKey } from './words';

/** Items the AI is at least this sure about start ticked; the rest wait for the person. */
export const AUTO_SELECT_CONFIDENCE = 0.5;
export const MAX_NAME_LENGTH = 80;
export const MAX_QTY = 100_000;

export interface DraftItem {
  /** Stable key for list rendering and edits. */
  key: string;
  name: string;
  qty: number | null;
  unit: string | null;
  /** 0..1 from the AI; 1 for items the person added. */
  confidence: number;
  selected: boolean;
}

export type DraftAction =
  | { type: 'toggle'; key: string }
  | { type: 'rename'; key: string; name: string }
  | { type: 'setQty'; key: string; qty: number | null }
  | { type: 'setUnit'; key: string; unit: string | null }
  | { type: 'remove'; key: string }
  | { type: 'add'; key: string; name: string }
  | { type: 'selectAll'; selected: boolean };

export function draftFromDetections(items: readonly SnapPantryItem[]): DraftItem[] {
  return items.map((item, index) => ({
    key: `found-${index}`,
    name: capitalize(item.name).slice(0, MAX_NAME_LENGTH),
    qty: item.quantity,
    unit: item.quantity == null ? null : item.unit,
    confidence: item.confidence,
    selected: item.confidence >= AUTO_SELECT_CONFIDENCE,
  }));
}

function patch(items: DraftItem[], key: string, change: Partial<DraftItem>): DraftItem[] {
  let changed = false;
  const next = items.map((item) => {
    if (item.key !== key) return item;
    changed = true;
    return { ...item, ...change };
  });
  return changed ? next : items;
}

export function draftReducer(items: DraftItem[], action: DraftAction): DraftItem[] {
  switch (action.type) {
    case 'toggle': {
      const item = items.find((entry) => entry.key === action.key);
      return item ? patch(items, action.key, { selected: !item.selected }) : items;
    }
    case 'rename':
      return patch(items, action.key, { name: action.name.slice(0, MAX_NAME_LENGTH) });
    case 'setQty': {
      const qty = action.qty != null && action.qty > 0 && action.qty <= MAX_QTY ? action.qty : null;
      // A unit without an amount means nothing, so clearing the amount clears the unit too.
      return patch(items, action.key, qty == null ? { qty, unit: null } : { qty });
    }
    case 'setUnit':
      return patch(items, action.key, { unit: action.unit });
    case 'remove':
      return items.filter((item) => item.key !== action.key);
    case 'add': {
      const name = action.name.trim().slice(0, MAX_NAME_LENGTH);
      if (!name || items.some((item) => item.key === action.key)) return items;
      return [
        ...items,
        { key: action.key, name, qty: null, unit: null, confidence: 1, selected: true },
      ];
    }
    case 'selectAll':
      return items.some((item) => item.selected !== action.selected)
        ? items.map((item) => ({ ...item, selected: action.selected }))
        : items;
  }
}

/**
 * Reads an amount typed by the person. Empty text clears it; fractions such as "1/2" and decimal
 * commas are accepted. Returns `undefined` for text that is not an amount.
 */
export function parseQty(text: string): number | null | undefined {
  const trimmed = text.trim().replace(',', '.');
  if (!trimmed) return null;
  const fraction = /^(\d+)\s*\/\s*(\d+)$/.exec(trimmed);
  const value = fraction
    ? Number(fraction[1]) / Number(fraction[2])
    : /^\d*\.?\d+$/.test(trimmed)
      ? Number(trimmed)
      : Number.NaN;
  if (!Number.isFinite(value) || value <= 0 || value > MAX_QTY) return undefined;
  return Math.round(value * 1000) / 1000;
}

export function selectedItems(items: readonly DraftItem[]): DraftItem[] {
  return items.filter((item) => item.selected && item.name.trim().length > 0);
}

export interface IngredientMatchInfo {
  id: string;
  name: string;
  category: IngredientCategory;
}

/**
 * Pantry entries for the ticked items. Matched items carry the catalog id and shelf; the name stays
 * as the person confirmed it.
 */
export function toNewPantryItems(
  items: readonly DraftItem[],
  matches: ReadonlyMap<string, IngredientMatchInfo | null>,
): NewPantryItem[] {
  return selectedItems(items).map((item) => {
    const match = matches.get(nameKey(item.name)) ?? null;
    return {
      ingredientId: match?.id ?? null,
      name: item.name.trim(),
      qty: item.qty,
      unit: item.qty == null ? null : item.unit,
      category: match?.category ?? 'other',
    };
  });
}

const sameName = (a: string, b: string) =>
  a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Whether the pantry now holds this entry: the same catalog ingredient (or, without one, the same
 * name) in the same unit. Used after adding to find entries the pantry turned away because it was
 * full, so the screen never claims more than it stored.
 */
export function isInPantry(
  items: Readonly<Record<string, PantryItem>>,
  entry: NewPantryItem,
): boolean {
  const unit = entry.unit?.trim() || null;
  return Object.values(items).some((item) => {
    if ((item.unit ?? null) !== unit) return false;
    if (entry.ingredientId && item.ingredientId) return entry.ingredientId === item.ingredientId;
    return sameName(item.name, entry.name);
  });
}
