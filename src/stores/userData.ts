/**
 * The set of per-account stores. Importing `@/stores` registers every one of them with sync, so
 * sync mirrors them all from its first start and wipes them all when the person signs out or
 * deletes their account, whichever screens have been opened.
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
import { useVariantStore, variantsSync } from './variants';

interface ResettableStore {
  getState(): { reset(): void };
  persist: { clearStorage(): void };
}

const userStores: readonly (readonly [ResettableStore, SyncCollectionAdapter])[] = [
  [usePreferencesStore, preferencesSync],
  [usePersonalDetailsStore, personalDetailsSync],
  [usePantryStore, pantrySync],
  [useSavedStore, savedSync],
  [useVariantStore, variantsSync],
  [useMealPlanStore, mealPlanSync],
  [useFeedbackStore, feedbackSync],
  [useCookLogStore, cookLogSync],
  [useShoppingStore, shoppingSync],
  [useChefStore, chefSync],
  [useSettingsStore, settingsSync],
];

/** Defaults in memory, persisted copy removed (the Keychain copy of personal details included). */
function resetStore(store: ResettableStore): void {
  store.getState().reset();
  store.persist.clearStorage();
}

// Sync learns about the user stores only from here. Resetting goes through the sync session
// (sign-out and account deletion), which stops the engine first so a wipe is never pushed.
for (const [store, adapter] of userStores) {
  registerSyncedStore({ adapter, reset: () => resetStore(store) });
}
