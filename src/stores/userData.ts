/**
 * The set of per-account stores: what sync mirrors, and what is wiped when the person signs out
 * or deletes their account.
 */
import { registerSyncedStore } from '@/lib/sync/registry';
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

interface ResettableStore {
  getState(): { reset(): void };
  persist: { clearStorage(): void };
}

const userStores: readonly (readonly [ResettableStore, SyncCollectionAdapter])[] = [
  [usePreferencesStore, preferencesSync],
  [usePersonalDetailsStore, personalDetailsSync],
  [usePantryStore, pantrySync],
  [useSavedStore, savedSync],
  [useMealPlanStore, mealPlanSync],
  [useFeedbackStore, feedbackSync],
  [useCookLogStore, cookLogSync],
  [useShoppingStore, shoppingSync],
  [useChefStore, chefSync],
  [useSettingsStore, settingsSync],
];

/** Every synced collection, one adapter per store. */
export const userSyncCollections: readonly SyncCollectionAdapter[] = userStores.map(
  ([, adapter]) => adapter,
);

function resetStore(store: ResettableStore): void {
  store.getState().reset();
  store.persist.clearStorage();
}

/**
 * Resets every user store to its defaults and removes their persisted copies (the Keychain copy
 * of personal details included). Stop sync first, or the reset would be synced as deletions.
 */
export function resetUserStores(): void {
  for (const [store] of userStores) resetStore(store);
}

// Sync mirrors these stores and clears them on sign-out; it learns about them only from here.
for (const [store, adapter] of userStores) {
  registerSyncedStore({ adapter, reset: () => resetStore(store) });
}
