/**
 * One-time move of answers an earlier build of Settings kept to itself into the shared stores.
 *
 * That build saved food preferences and notification choices under the `settings.user` key (one
 * entry per account) and personal details in a per-account Keychain entry. Nothing else in the app
 * read them, so an allergen added there never reached the safety filter. Once the signed-in
 * account's stores hold its own, freshly synced data, its entry is merged into the shared stores
 * and that account's old copies are deleted. Entries of other accounts are left alone: each is
 * moved when that account next signs in on this device.
 *
 * Merging never loosens safety: declared allergens and diets are added to what the shared store
 * already holds, never used to replace it. Other answers only overwrite the shared store when the
 * old entry holds something other than that build's defaults, since its entries were also created
 * with defaults when only a notification switch had been touched.
 */
import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
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
import { storageKey } from '@/lib/storage/kv';
import { useSyncStatusStore } from '@/lib/sync';

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

/** The old zustand `persist` envelope: `{ state: { accounts: { [userId]: entry } }, version }`. */
const legacyEnvelope = z.looseObject({
  state: z.looseObject({ accounts: z.record(z.string(), z.unknown()) }),
});
type LegacyEnvelope = z.infer<typeof legacyEnvelope>;

/** Read directly, so an unreadable value is never deleted along with other accounts' answers. */
const LEGACY_KEY = storageKey('settings.user');
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

type LegacyRead =
  | { kind: 'absent' }
  /** Stored but unreadable. Nothing in it can be attributed to an account, so it is kept. */
  | { kind: 'malformed' }
  | { kind: 'ok'; envelope: LegacyEnvelope };

function readLegacyEnvelope(): LegacyRead {
  let raw: string | null;
  try {
    raw = Storage.getItemSync(LEGACY_KEY);
  } catch (error) {
    logger.warn('Could not read the old settings entry', describeError(error));
    return { kind: 'malformed' };
  }
  if (raw == null) return { kind: 'absent' };
  try {
    const parsed = legacyEnvelope.safeParse(JSON.parse(raw));
    if (parsed.success) return { kind: 'ok', envelope: parsed.data };
  } catch {
    // Not JSON; reported below.
  }
  logger.warn('The old settings entry is unreadable; leaving it in place');
  return { kind: 'malformed' };
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
 * Deletes one account's old copies: its entry in the shared key/value value (the key goes once no
 * account is left in it) and its Keychain personal details. Other accounts' entries are kept.
 */
export async function discardLegacyAccount(userId: string): Promise<void> {
  const read = readLegacyEnvelope();
  if (read.kind === 'ok' && userId in read.envelope.state.accounts) {
    const { [userId]: _removed, ...rest } = read.envelope.state.accounts;
    try {
      if (Object.keys(rest).length === 0) Storage.removeItemSync(LEGACY_KEY);
      else {
        const next = { ...read.envelope, state: { ...read.envelope.state, accounts: rest } };
        Storage.setItemSync(LEGACY_KEY, JSON.stringify(next));
      }
    } catch (error) {
      logger.warn('Could not remove the old settings entry', describeError(error));
    }
  }
  await SecureStore.deleteItemAsync(legacyPersonalKey(userId)).catch((error: unknown) => {
    logger.warn('Could not remove old personal details', describeError(error));
  });
}

const stillSignedInAs = (userId: string) => useSessionStore.getState().userId === userId;

/**
 * True once this sync run has completed a pull. Only then do the stores hold the account's latest
 * answers: writing earlier would stamp stale data as newest and could overwrite a change made on
 * another device (an allergen added there, say). `lastSyncedAt` starts empty for every run.
 */
function syncHasPulled(): boolean {
  const status = useSyncStatusStore.getState();
  return status.phase !== 'stopped' && status.lastSyncedAt != null;
}

const canWriteFor = (userId: string) => stillSignedInAs(userId) && isOnboarded() && syncHasPulled();

export type LegacyMigrationResult =
  /** Old answers were moved and this account's old copies deleted. */
  | 'migrated'
  /** This account has no old copies. */
  | 'nothing'
  /** Not safe to write yet (wrong account, not onboarded, or no completed pull); try later. */
  | 'notReady';

/**
 * Moves the signed-in account's old Settings answers into the shared stores, then deletes that
 * account's old copies. It checks for itself that `userId` is signed in, that the stores hold its
 * onboarding answers and that sync has completed a pull, so it never writes into another account's
 * data or ahead of newer synced answers.
 */
export async function migrateLegacySettings(userId: string): Promise<LegacyMigrationResult> {
  if (!canWriteFor(userId)) return 'notReady';
  const read = readLegacyEnvelope();
  const entry = read.kind === 'ok' ? read.envelope.state.accounts[userId] : undefined;
  const old = await readLegacyPersonalDetails(userId);
  if (entry === undefined && !old.present) return 'nothing';

  await personalDetailsLoaded();
  if (!canWriteFor(userId)) return 'notReady';

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
  await discardLegacyAccount(userId);
  logger.info('Moved old Settings answers into the shared stores');
  return 'migrated';
}

/** Accounts whose old answers have been dealt with in this app session. */
const checked = new Set<string>();
/** Runs in flight, per account, so one account's run never holds up another's. */
const running = new Map<string, Promise<void>>();

/**
 * Runs the migration once per signed-in account, after sync has completed a pull for it. Each
 * completed sync round re-evaluates, so an attempt that was not ready yet is retried, and a change
 * of account starts that account's own attempt.
 */
export function useLegacySettingsMigration(): void {
  const userId = useSessionStore((s) => (s.status === 'ready' ? s.userId : null));
  const syncedAt = useSyncStatusStore((s) => (s.phase === 'stopped' ? null : s.lastSyncedAt));

  useEffect(() => {
    if (!userId || syncedAt == null || checked.has(userId) || running.has(userId)) return;
    const run = migrateLegacySettings(userId)
      .then((result) => {
        if (result !== 'notReady') checked.add(userId);
      })
      .catch((error: unknown) => {
        logger.warn('Could not move old Settings answers yet', describeError(error));
      })
      .finally(() => {
        running.delete(userId);
      });
    running.set(userId, run);
  }, [userId, syncedAt]);
}

/** Test hook. */
export function resetLegacyMigrationForTests(): void {
  checked.clear();
  running.clear();
}
