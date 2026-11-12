/**
 * What Settings uses from modules owned elsewhere: the shared user stores, the domain vocabulary
 * for the preference editors, account lifecycle calls from the auth feature, push categories
 * from the notifications feature, the health connection card and the community safety links.
 *
 * Settings keeps no copy of user data of its own. Preferences, personal details and app settings
 * are read and written in the shared stores, which is what recommendations, safety filtering,
 * search and Chef read too, and which sync and sign-out already cover.
 */
import {
  deleteMyAccount,
  identityFor,
  signOut,
  useSessionStore,
  type SignOutScope,
} from '@/features/auth';
import {
  fetchPushCategories,
  savePushCategories,
  syncPushRegistration,
  unregisterPushDevice,
  type PushCategories,
  type PushCategory,
} from '@/features/notifications';
import { toDomainGoal, toStoredGoal } from '@/features/setup';
import {
  selectIsOnboarded,
  selectPersonalDetails,
  selectPreferences,
  selectSettings,
  usePersonalDetailsStore,
  usePreferencesStore,
  useSettingsStore,
} from '@/stores';

// ---------------------------------------------------------------------------------------------
// Shared user stores

export {
  ACTIVITY_LEVELS,
  MAX_CUISINES,
  emptyPersonalDetails,
  personalDetailsSchema,
  preferencesSchema,
  selectAvoidAllergens,
  selectHasAnsweredAllergens,
  selectHasPersonalDetails,
  selectIsOnboarded,
  selectNotificationSettings,
  selectPersonalDetails,
  selectPreferences,
  selectSettings,
  selectUnits,
  usePersonalDetailsHydrated,
  usePersonalDetailsStore,
  usePreferencesStore,
  useSettingsStore,
  type ActivityLevel,
  type Appearance,
  type HealthGoal,
  type PersonalDetails,
  type Preferences,
  type Sex,
  type Units,
} from '@/stores';

/** Goal vocabulary translation shared with onboarding, so both editors store the same ids. */
export { toDomainGoal, toStoredGoal };

/** Resolves once the Keychain copy of personal details has been read; rejects if it cannot be. */
export async function personalDetailsLoaded(): Promise<void> {
  const { persist } = usePersonalDetailsStore;
  if (!persist.hasHydrated()) await persist.rehydrate();
  if (!persist.hasHydrated()) throw new Error('Personal details could not be read');
}

/** Whether the shared stores hold this account's onboarding answers. */
export const isOnboarded = () => selectIsOnboarded(usePreferencesStore.getState());

// ---------------------------------------------------------------------------------------------
// Account push categories, stored server-side by the notifications feature

export { fetchPushCategories, savePushCategories, syncPushRegistration };
export type { PushCategories, PushCategory };

// ---------------------------------------------------------------------------------------------
// Account lifecycle

/** Detaches this device from the account's push notifications; never throws. */
export { unregisterPushDevice };

export { useSessionStore };
export type { SignOutScope };

/**
 * The auth feature's sign-out: flushes pending sync, wipes every user store on this device and
 * ends the session for the given scope. Resolves true when other devices were signed out too.
 */
export async function endAuthSession(scope: SignOutScope): Promise<boolean> {
  return (await signOut({ scope })).everywhere;
}

/**
 * The auth feature's account deletion for the signed-in account. It deletes the account on the
 * server, then stops sync and wipes local user data without pushing anything
 * (`accountDeletedCleanup`). The caller ends the session afterwards.
 */
export async function deleteSignedInAccount(userId: string): Promise<void> {
  await deleteMyAccount(await identityFor(userId));
}

/** Everything this device holds for the signed-in account, for the data export. */
export async function collectLocalData(): Promise<Record<string, unknown>> {
  await personalDetailsLoaded();
  return {
    preferences: selectPreferences(usePreferencesStore.getState()),
    settings: selectSettings(useSettingsStore.getState()),
    personalDetails: selectPersonalDetails(usePersonalDetailsStore.getState()),
  };
}

// ---------------------------------------------------------------------------------------------
// Health

/**
 * The health feature's Apple Health connection card. Its public surface never loads the native
 * module, so importing it here keeps Settings light.
 */
export { HealthConnections } from '@/features/health';

// ---------------------------------------------------------------------------------------------
// Community safety

/** Links to the moderation feature's screens, and whether the review tools apply to this person. */
export { blockedPeopleHref, reviewQueueHref, useIsModerator } from '@/features/moderation';
