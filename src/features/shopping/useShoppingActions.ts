/**
 * What the shopping screen can do to its list: add extras, share it as text, untick, and move
 * ticked items into the pantry.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { Share } from 'react-native';

import { describeError, logger } from '@/lib/logger';
import { usePantryStore } from '@/stores/pantry';
import { selectUnits, useSettingsStore } from '@/stores/settings';
import { useShoppingStore } from '@/stores/shopping';
import { toast } from '@/ui';

import type { PlannedList } from './buildList';
import { useCurrentUserId } from './deps';
import { extraKey, selectExtrasFor, useShoppingExtrasStore, type ExtraItem } from './extrasStore';
import {
  fitIntoPantry,
  markBoughtMessage,
  pantryInputsForExtras,
  pantryInputsForItems,
  type BoughtLine,
} from './markBought';
import { linkPantryItems } from './pantryLink';
import { shoppingShareText } from './shareText';
import { staleTickKeys } from './ticks';

export interface ShoppingActions {
  readonly extras: readonly ExtraItem[];
  readonly canShare: boolean;
  readonly addExtra: (name: string) => void;
  readonly share: () => void;
  readonly markBought: () => void;
  readonly clearTicks: () => void;
}

export function useShoppingActions({
  list,
  title,
}: {
  list: PlannedList | null;
  title: string;
}): ShoppingActions {
  const userId = useCurrentUserId();
  const owner = useShoppingExtrasStore((state) => state.ownerId);
  const claim = useShoppingExtrasStore((state) => state.claim);
  const extras = useShoppingExtrasStore(selectExtrasFor(userId));
  const checked = useShoppingStore((state) => state.checked);
  const system = useSettingsStore(selectUnits);

  // Extras stored for another account are dropped as soon as this account opens the list.
  useEffect(() => {
    if (userId != null && owner !== userId) claim(userId);
  }, [userId, owner, claim]);

  // Ticks left from an earlier shopping trip are cleared when the list opens.
  useEffect(() => {
    const store = useShoppingStore.getState();
    const stale = staleTickKeys(store.checked, new Date());
    if (stale.length > 0) store.clear(stale);
  }, []);

  const shareText = useMemo(
    () => shoppingShareText({ title, groups: list?.groups ?? [], extras, checked, system }),
    [title, list, extras, checked, system],
  );

  const addExtra = useCallback(
    (name: string) => {
      if (userId == null) return;
      claim(userId);
      useShoppingExtrasStore.getState().add(name);
    },
    [userId, claim],
  );

  const share = useCallback(() => {
    if (!shareText) return;
    Share.share({ message: shareText }).catch((error: unknown) => {
      logger.warn('Sharing the shopping list failed', describeError(error));
      toast.show({ message: 'Couldn’t open sharing. Try again.', tone: 'danger' });
    });
  }, [shareText]);

  const markBought = useCallback(() => {
    const ingredientsById = list?.ingredientsById ?? new Map();
    const pantryItems = usePantryStore.getState().items;
    // Read the pantry the way the list did, so a free-text "eggs" counts as the catalog egg.
    const pantry = linkPantryItems(Object.values(pantryItems), list?.catalogNames ?? new Map());
    const extraIdByKey = new Map<string, string>();
    const lines: BoughtLine[] = [];
    for (const item of list?.items ?? []) {
      if (checked[item.key]) {
        lines.push({
          key: item.key,
          inputs: pantryInputsForItems([item], ingredientsById, pantry),
        });
      }
    }
    for (const extra of extras) {
      const key = extraKey(extra.id);
      if (!checked[key]) continue;
      extraIdByKey.set(key, extra.id);
      lines.push({ key, inputs: pantryInputsForExtras([extra]), leavesList: true });
    }
    if (lines.length === 0) return;

    const at = new Date().toISOString();
    const { fits, unchanged, left } = fitIntoPantry(pantryItems, lines, at);
    if (fits.length > 0) {
      // Only what made it into the pantry leaves the list; the rest stays ticked.
      usePantryStore.getState().addMany(
        fits.flatMap((line) => line.inputs),
        at,
      );
      useShoppingStore.getState().clear(fits.map((line) => line.key));
      useShoppingExtrasStore
        .getState()
        .removeMany(fits.flatMap((line) => extraIdByKey.get(line.key) ?? []));
    }
    toast.show(markBoughtMessage(fits.length, unchanged.length, left.length));
  }, [list, extras, checked]);

  const clearTicks = useCallback(() => useShoppingStore.getState().clear(), []);

  return { extras, canShare: shareText != null, addExtra, share, markBought, clearTicks };
}
