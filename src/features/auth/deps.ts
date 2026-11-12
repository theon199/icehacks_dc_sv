/**
 * The shared modules the account flow builds on: the per-account user stores (`@/stores`) and the
 * sync session (`@/lib/sync`). Auth reads them only through this file.
 *
 * Importing `@/stores` also registers every user store with sync, which `startSync` needs and which
 * lets the cleanups below wipe all of them (pantry, saved, plan, chef threads, the Keychain copy of
 * personal details, ...) rather than a hand-picked few.
 */
import { accountDeletedCleanup, signOutCleanup, startSync, stopSync } from '@/lib/sync';
import {
  selectAiConsentHint,
  selectIsOnboarded,
  usePreferencesStore,
  useSettingsStore,
} from '@/stores';

export { accountDeletedCleanup, signOutCleanup, startSync, stopSync };

/** Onboarding completion, as recorded in the synced preferences document. */
export const onboarding = {
  isComplete(): boolean {
    return selectIsOnboarded(usePreferencesStore.getState());
  },

  /** Calls `listener` whenever completion changes, e.g. when a returning person's answers sync in. */
  subscribe(listener: (complete: boolean) => void): () => void {
    return usePreferencesStore.subscribe((state, previous) => {
      const complete = selectIsOnboarded(state);
      if (complete !== selectIsOnboarded(previous)) listener(complete);
    });
  },
};

/**
 * The last known AI consent answer, kept by the settings store as a launch hint. The account record
 * stays the source of truth (see `reconcileAiConsent` in Settings); anything missing reads as "not
 * agreed", so AI stays closed until the person or the server says otherwise.
 */
export const aiConsentHint = {
  read(): boolean {
    return selectAiConsentHint(useSettingsStore.getState())?.granted ?? false;
  },

  remember(granted: boolean): void {
    useSettingsStore.getState().rememberAiConsent(granted);
  },
};
