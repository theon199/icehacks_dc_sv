/**
 * The set of per-account stores: what sync mirrors, and what is wiped when the person signs out
 * or deletes their account.
 */
import type { SyncCollectionAdapter } from '@/lib/sync/types';

import { useChefStore, chefSync } from './chef';
import { useCookLogStore, cookLogSync } from './cookLog';
import { useFeedbackStore, feedbackSync } from './feedback';
import { useMealPlanStore, mealPlanSync } from './mealPlan';
import { usePantryStore, pantrySync } from './pantry';
import { usePersonalDetailsStore, personalDetailsSync } from './personalDetails';
import { usePreferencesStore, preferencesSync } from './preferences';
import { useSavedStore, savedSync } from './saved';
import { useSettingsStore, settingsSync } from './settings';
import { useShoppingStore, shoppingSync } from './shopping';

/** Every synced collection, one adapter per store. */
export const userSyncCollections: readonly SyncCollectionAdapter[] = [
  preferencesSync,
  personalDetailsSync,
  pantrySync,
  savedSync,
  mealPlanSync,
  feedbackSync,
  cookLogSync,
  shoppingSync,
  chefSync,
  settingsSync,
];

interface ResettableStore {
  getState(): { reset(): void };
  persist: { clearStorage(): void };
}

const userStores: readonly ResettableStore[] = [
  usePreferencesStore,
  usePersonalDetailsStore,
  usePantryStore,
  useSavedStore,
  useMealPlanStore,
  useFeedbackStore,
  useCookLogStore,
  useShoppingStore,
  useChefStore,
  useSettingsStore,
];

/**
 * Resets every user store to its defaults and removes their persisted copies (the Keychain copy
 * of personal details included). Stop sync first, or the reset would be synced as deletions.
 */
export function resetUserStores(): void {
  for (const store of userStores) {
    store.getState().reset();
    store.persist.clearStorage();
  }
}
