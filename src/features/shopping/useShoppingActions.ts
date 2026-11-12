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
import { pantryInputsForExtras, pantryInputsForItems } from './markBought';
import { shoppingShareText } from './shareText';

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
    const bought = (list?.items ?? []).filter((item) => checked[item.key]);
    const boughtExtras = extras.filter((extra) => checked[extraKey(extra.id)]);
    const inputs = [
      ...pantryInputsForItems(bought, list?.ingredientsById ?? new Map()),
      ...pantryInputsForExtras(boughtExtras),
    ];
    if (inputs.length === 0) return;
    usePantryStore.getState().addMany(inputs);
    useShoppingStore
      .getState()
      .clear([
        ...bought.map((item) => item.key),
        ...boughtExtras.map((extra) => extraKey(extra.id)),
      ]);
    useShoppingExtrasStore.getState().removeMany(boughtExtras.map((extra) => extra.id));
    const count = bought.length + boughtExtras.length;
    toast.show({
      message: `Added ${count} ${count === 1 ? 'item' : 'items'} to your pantry`,
      tone: 'success',
    });
  }, [list, extras, checked]);

  const clearTicks = useCallback(() => useShoppingStore.getState().clear(), []);

  return { extras, canShare: shareText != null, addExtra, share, markBought, clearTicks };
}
