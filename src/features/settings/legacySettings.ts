/**
 * One-time move of answers an earlier build of Settings kept to itself into the shared stores.
 *
 * That build saved food preferences and notification choices under the `settings.user` key (one
 * entry per account) and personal details in a per-account Keychain entry. Nothing else in the app
 * read them, so an allergen added there never reached the safety filter. Once the signed-in
 * account's stores are known to be its own, its entry is merged into the shared stores and every
 * old copy is deleted.
 *
 * Merging never loosens safety: declared allergens and diets are added to what the shared store
 * already holds, never used to replace it. Other answers only overwrite the shared store when the
 * old entry holds something other than that build's defaults, since its entries were also created
 * with defaults when only a notification switch had been touched.
 */
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { z } from 'zod';

import {
  allergenIdSchema,
  cuisineIdSchema,
  dietFlagNameSchema,
  goalIdSchema,
  type AllergenId,
  type DietFlagName,
} from '@/domain/types';
import { describeError, logger } from '@/lib/logger';
import { defineKvKey } from '@/lib/storage/kv';
import { selectSyncPhase, useSyncStatusStore } from '@/lib/sync';

import {
  MAX_CUISINES,
  emptyPersonalDetails,
  isOnboarded,
  personalDetailsLoaded,
  personalDetailsSchema,
  preferencesSchema,
  selectHasPersonalDetails,
  toStoredGoal,
  usePersonalDetailsStore,
  usePreferencesStore,
  useSessionStore,
  useSettingsStore,
  type PersonalDetails,
  type Preferences,
} from './deps';

/** The old zustand `persist` envelope: `{ state: { accounts: { [userId]: entry } } }`. */
const legacyEnvelope = z.object({
  state: z.object({ accounts: z.record(z.string(), z.unknown()) }),
});

const legacyKey = defineKvKey('settings.user', legacyEnvelope);
const legacyPersonalKey = (userId: string) => `famara.personal-details.${userId}`;

/** Each field is read on its own, so one odd value cannot take the rest of the entry with it. */
const legacyEntrySchema = z.object({
  preferences: z
    .object({
      cuisines: z.array(z.string()).catch([]),
      diets: z.array(z.string()).catch([]),
      allergens: z.array(z.string()).nullable().catch(null),
      goals: z.array(z.string()).catch([]),
      timeBudgetMinutes: z.number().nullable().catch(null),
      effort: z.number().catch(2),
      householdSize: z.number().catch(2),
      smallAppetite: z.boolean().catch(false),
      units: z.string().catch('us'),
    })
    .partial()
    .catch({}),
  notifications: z
    .object({ cookTimers: z.boolean().catch(false) })
    .partial()
    .catch({}),
});

type LegacyEntry = z.infer<typeof legacyEntrySchema>;

export interface LegacyMigrationPlan {
  /** Full allergen list to record (already merged with the shared store); undefined to leave it. */
  allergens?: AllergenId[];
  preferences: Partial<Preferences>;
  units?: 'metric';
  cookTimers?: true;
}

const known = <T>(schema: z.ZodType<T>, values: readonly unknown[]): T[] => {
  const out: T[] = [];
  for (const value of values) {
    const parsed = schema.safeParse(value);
    if (parsed.success && !out.includes(parsed.data)) out.push(parsed.data);
  }
  return out;
};

const sameMembers = <T>(a: readonly T[], b: readonly T[]) =>
  a.length === b.length && a.every((value) => b.includes(value));

/** A value for one preferences field, kept only when the shared schema accepts it. */
function field<K extends keyof Preferences>(key: K, value: unknown): Partial<Pick<Preferences, K>> {
  const parsed = preferencesSchema.shape[key].safeParse(value);
  return parsed.success ? ({ [key]: parsed.data } as Partial<Pick<Preferences, K>>) : {};
}

/** Works out what an old entry adds to the shared stores. Pure, so it is tested on its own. */
export function planLegacyMigration(entry: unknown, current: Preferences): LegacyMigrationPlan {
  const legacy: LegacyEntry = legacyEntrySchema
    .catch({ preferences: {}, notifications: {} })
    .parse(entry ?? {});
  const old = legacy.preferences;
  const plan: LegacyMigrationPlan = { preferences: {} };

  if (old.allergens != null) {
    const base = current.allergensAnswered ? current.allergens : [];
    const merged = known<AllergenId>(allergenIdSchema, [...base, ...old.allergens]);
    if (!current.allergensAnswered || !sameMembers(merged, current.allergens)) {
      plan.allergens = merged;
    }
  }

  const diets = known<DietFlagName>(dietFlagNameSchema, [...current.diets, ...(old.diets ?? [])]);
  if (!sameMembers(diets, current.diets)) Object.assign(plan.preferences, field('diets', diets));

  const cuisines = known(cuisineIdSchema, old.cuisines ?? []).slice(0, MAX_CUISINES);
  if (cuisines.length > 0) Object.assign(plan.preferences, field('cuisines', cuisines));

  const goals = known(goalIdSchema, old.goals ?? []).map(toStoredGoal);
  if (goals.length > 0) Object.assign(plan.preferences, field('goals', goals));

  if (old.timeBudgetMinutes != null) {
    Object.assign(plan.preferences, field('maxMinutes', old.timeBudgetMinutes));
  }
  if (old.effort != null && old.effort !== 2) {
    Object.assign(plan.preferences, field('effort', old.effort));
  }
  if (old.householdSize != null && old.householdSize !== 2) {
    Object.assign(plan.preferences, field('householdSize', old.householdSize));
  }
  if (old.smallAppetite === true) plan.preferences.smallAppetite = true;
  if (old.units === 'metric') plan.units = 'metric';
  if (legacy.notifications.cookTimers === true) plan.cookTimers = true;
  return plan;
}

function readLegacyAccounts(): Record<string, unknown> | null {
  try {
    return legacyKey.getSync()?.state.accounts ?? null;
  } catch (error) {
    logger.warn('Could not read the old settings entry', describeError(error));
    return null;
  }
}

interface LegacyPersonalDetails {
  /** Whether an old Keychain entry exists at all, readable or not. */
  present: boolean;
  details: PersonalDetails | null;
}

async function readLegacyPersonalDetails(userId: string): Promise<LegacyPersonalDetails> {
  const raw = await SecureStore.getItemAsync(legacyPersonalKey(userId));
  if (!raw) return { present: false, details: null };
  try {
    // That build filled every field in, but a missing one simply means "not given".
    const value: unknown = JSON.parse(raw);
    const parsed = personalDetailsSchema.safeParse({
      ...emptyPersonalDetails,
      ...(typeof value === 'object' && value != null ? value : {}),
    });
    return { present: true, details: parsed.success ? parsed.data : null };
  } catch {
    return { present: true, details: null };
  }
}

/**
 * Deletes every old copy: the shared key/value entry and the Keychain entry of each account it
 * names (plus `alsoFor`, which may have personal details without a key/value entry).
 */
export async function discardLegacySettings(alsoFor?: string | null): Promise<void> {
  const accounts = Object.keys(readLegacyAccounts() ?? {});
  if (alsoFor && !accounts.includes(alsoFor)) accounts.push(alsoFor);
  try {
    await legacyKey.remove();
  } catch (error) {
    logger.warn('Could not remove the old settings entry', describeError(error));
  }
  await Promise.all(
    accounts.map((id) =>
      SecureStore.deleteItemAsync(legacyPersonalKey(id)).catch((error: unknown) => {
        logger.warn('Could not remove old personal details', describeError(error));
      }),
    ),
  );
}

const stillSignedInAs = (userId: string) => useSessionStore.getState().userId === userId;

/**
 * Moves the signed-in account's old Settings answers into the shared stores, then deletes every old
 * copy. Call it only once the stores are known to hold this account's data (sync has started).
 * Resolves true when old data was found and handled; leaves it in place to retry later when the
 * account changes meanwhile or its stores are not ready.
 */
export async function migrateLegacySettings(userId: string): Promise<boolean> {
  if (!stillSignedInAs(userId) || !isOnboarded()) return false;
  const accounts = readLegacyAccounts();
  const old = await readLegacyPersonalDetails(userId);
  if (accounts == null && !old.present) return false;

  await personalDetailsLoaded();
  if (!stillSignedInAs(userId) || !isOnboarded()) return false;

  const entry = accounts?.[userId];
  if (entry != null) {
    const prefs = usePreferencesStore.getState();
    const plan = planLegacyMigration(entry, prefs.prefs);
    if (plan.allergens) prefs.setAllergens(plan.allergens);
    if (Object.keys(plan.preferences).length > 0) prefs.update(plan.preferences);
    const settings = useSettingsStore.getState();
    if (plan.units) settings.setUnits(plan.units);
    if (plan.cookTimers) settings.setNotifications({ cookTimers: true });
  }
  if (old.details != null && !selectHasPersonalDetails(usePersonalDetailsStore.getState())) {
    usePersonalDetailsStore.getState().update(old.details);
  }
  await discardLegacySettings(userId);
  logger.info('Moved old Settings answers into the shared stores');
  return true;
}

let checkedFor: string | null = null;
let running: Promise<unknown> | null = null;

/**
 * Runs the migration once per signed-in account, as soon as that account is in the app and sync
 * has started (which is when sync has confirmed the local stores belong to it).
 */
export function useLegacySettingsMigration(): void {
  const userId = useSessionStore((s) => (s.status === 'ready' ? s.userId : null));
  const syncStarted = useSyncStatusStore((s) => selectSyncPhase(s) !== 'stopped');

  useEffect(() => {
    if (!userId || !syncStarted || checkedFor === userId || running) return;
    const run = migrateLegacySettings(userId)
      .then((done) => {
        // Nothing to move also counts as checked; an unready store is tried again later.
        if (done || (stillSignedInAs(userId) && isOnboarded())) checkedFor = userId;
      })
      .catch((error: unknown) => {
        logger.warn('Could not move old Settings answers yet', describeError(error));
      })
      .finally(() => {
        running = null;
      });
    running = run;
  }, [userId, syncStarted]);
}

/** Test hook. */
export function resetLegacyMigrationForTests(): void {
  checkedFor = null;
  running = null;
}
