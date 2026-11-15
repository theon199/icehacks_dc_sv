/**
 * Adds the ticked items of a review to the pantry. The pantry turns items away when it is full or
 * an entry breaks its rules, so this checks what really landed: anything turned away stays on the
 * review (everything that landed is taken off it) and a toast says what happened.
 */
import { useCallback, type Dispatch } from 'react';

import { haptics } from '@/lib/haptics';
import { MAX_PANTRY_ITEMS, usePantryStore } from '@/stores';
import { toast } from '@/ui';

import {
  isInPantry,
  selectedItems,
  toNewPantryItems,
  type DraftAction,
  type DraftItem,
  type IngredientMatchInfo,
} from '../logic/pantryDraft';

export interface AddedToPantry {
  count: number;
  /** Catalog ids of what was added, for the meals it makes possible. */
  snappedIds: string[];
}

/** What to say when the pantry kept some (or none) of the ticked items. */
export function refusalMessage(landed: number, refused: number, full: boolean): string {
  const lead = landed === 0 ? '' : `Added ${landed}. `;
  if (full) {
    return landed === 0
      ? `Your pantry is full (${MAX_PANTRY_ITEMS} items). Remove a few items to make room.`
      : `${lead}${refused} didn't fit: your pantry holds ${MAX_PANTRY_ITEMS} items.`;
  }
  const what = refused === 1 ? "1 item couldn't" : `${refused} items couldn't`;
  return `${lead}${what} be added. Check the name and amount, then try again.`;
}

export function useAddToPantry(dispatch: Dispatch<DraftAction>) {
  const addMany = usePantryStore((state) => state.addMany);
  /** Null when nothing was added, or when some items were turned away and stay on the review. */
  return useCallback(
    (
      items: readonly DraftItem[],
      matches: ReadonlyMap<string, IngredientMatchInfo | null>,
    ): AddedToPantry | null => {
      const kept = selectedItems(items);
      const entries = toNewPantryItems(items, matches);
      if (entries.length === 0) return null;
      addMany(entries);
      const stored = usePantryStore.getState().items;
      const refusedKeys = new Set<string>();
      entries.forEach((entry, index) => {
        const key = kept[index]?.key;
        if (key && !isInPantry(stored, entry)) refusedKeys.add(key);
      });
      if (refusedKeys.size > 0) {
        const landed = entries.length - refusedKeys.size;
        haptics.warning();
        // Keep the review open with only what did not fit, so nothing is silently lost.
        for (const item of kept) {
          if (!refusedKeys.has(item.key)) dispatch({ type: 'remove', key: item.key });
        }
        const full = Object.keys(stored).length >= MAX_PANTRY_ITEMS;
        toast.show({ message: refusalMessage(landed, refusedKeys.size, full), tone: 'danger' });
        return null;
      }
      haptics.success();
      toast.show({
        message: entries.length === 1 ? 'Added to your pantry' : `${entries.length} items added`,
        tone: 'success',
      });
      return {
        count: entries.length,
        snappedIds: entries.flatMap((entry) => (entry.ingredientId ? [entry.ingredientId] : [])),
      };
    },
    [addMany, dispatch],
  );
}
