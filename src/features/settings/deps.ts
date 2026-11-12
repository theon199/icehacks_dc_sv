/**
 * The narrow slice of shared user state that Settings reads and writes: food preferences, push
 * notification choices, optional personal details, the health connections panel and the local
 * cleanup that follows account deletion.
 *
 * Everything Settings needs from modules owned elsewhere goes through this file, so pointing it at
 * the shared stores (`src/stores`) and vocabulary (`src/domain/types`) is a change here only. Until
 * those land, a small persisted slice keeps the same shape: preferences and notification choices
 * live in the SQLite key/value store, personal details in the Keychain.
 */
import * as SecureStore from 'expo-secure-store';
import type { ComponentType } from 'react';
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { useSessionStore } from '@/features/auth';
import { unregisterPushDevice } from '@/features/notifications';
import { logger } from '@/lib/logger';
import { persistStorage } from '@/lib/storage/kv';

// ---------------------------------------------------------------------------------------------
// Vocabulary (ids match docs/DATA.md and the onboarding questionnaire)

export const ALLERGENS = [
  ['milk', 'Milk'],
  ['egg', 'Egg'],
  ['fish', 'Fish'],
  ['shellfish', 'Shellfish'],
  ['tree_nut', 'Tree nuts'],
  ['peanut', 'Peanuts'],
  ['wheat', 'Wheat'],
  ['soy', 'Soy'],
  ['sesame', 'Sesame'],
  ['gluten', 'Gluten'],
] as const;
export type AllergenId = (typeof ALLERGENS)[number][0];

export const DIETS = [
  ['vegetarian', 'Vegetarian'],
  ['vegan', 'Vegan'],
  ['pescatarian', 'Pescatarian'],
  ['no_pork', 'No pork'],
  ['no_beef', 'No beef'],
  ['no_alcohol', 'No alcohol'],
  ['halal_friendly', 'Halal-friendly'],
  ['gluten_free', 'Gluten-free'],
  ['dairy_free', 'Dairy-free'],
] as const;
export type DietId = (typeof DIETS)[number][0];

export const GOALS = [
  ['more_protein', 'More protein'],
  ['more_fiber', 'More fiber'],
  ['lower_sodium', 'Lower sodium'],
  ['heart_friendly', 'Heart-friendly'],
  ['lighter_meals', 'Lighter meals'],
  ['plant_forward', 'Plant-forward'],
  ['steady_energy', 'Steadier energy'],
] as const;
export type GoalId = (typeof GOALS)[number][0];

/** Cuisines offered in the editor, grouped by region. Ids are lowercase snake_case slugs. */
export const CUISINE_GROUPS: readonly { region: string; cuisines: readonly [string, string][] }[] =
  [
    {
      region: 'Americas',
      cuisines: [
        ['american', 'American'],
        ['mexican', 'Mexican'],
        ['peruvian', 'Peruvian'],
        ['brazilian', 'Brazilian'],
      ],
    },
    {
      region: 'Caribbean',
      cuisines: [
        ['jamaican', 'Jamaican'],
        ['cuban', 'Cuban'],
        ['puerto_rican', 'Puerto Rican'],
        ['haitian', 'Haitian'],
      ],
    },
    {
      region: 'Europe',
      cuisines: [
        ['british', 'British'],
        ['french', 'French'],
        ['italian', 'Italian'],
        ['spanish', 'Spanish'],
        ['greek', 'Greek'],
        ['polish', 'Polish'],
      ],
    },
    {
      region: 'Middle East & North Africa',
      cuisines: [
        ['turkish', 'Turkish'],
        ['lebanese', 'Lebanese'],
        ['iranian', 'Iranian'],
        ['moroccan', 'Moroccan'],
        ['egyptian', 'Egyptian'],
      ],
    },
    {
      region: 'Sub-Saharan Africa',
      cuisines: [
        ['nigerian', 'Nigerian'],
        ['ghanaian', 'Ghanaian'],
        ['ethiopian', 'Ethiopian'],
        ['kenyan', 'Kenyan'],
        ['south_african', 'South African'],
      ],
    },
    {
      region: 'South & Central Asia',
      cuisines: [
        ['indian', 'Indian'],
        ['pakistani', 'Pakistani'],
        ['bangladeshi', 'Bangladeshi'],
        ['sri_lankan', 'Sri Lankan'],
        ['afghan', 'Afghan'],
      ],
    },
    {
      region: 'East & Southeast Asia',
      cuisines: [
        ['chinese', 'Chinese'],
        ['japanese', 'Japanese'],
        ['korean', 'Korean'],
        ['thai', 'Thai'],
        ['vietnamese', 'Vietnamese'],
        ['filipino', 'Filipino'],
        ['malaysian', 'Malaysian'],
      ],
    },
  ];

export const MAX_LOVED_CUISINES = 5;
export const TIME_BUDGET_CHOICES = [15, 30, 45, 60] as const;
export const EFFORT_CHOICES = [
  [1, 'Keep it easy'],
  [2, 'Some effort'],
  [3, 'Happy to go big'],
] as const;
export type Effort = 1 | 2 | 3;
export type Units = 'us' | 'metric';

// ---------------------------------------------------------------------------------------------
// Shapes

export interface UserPreferences {
  cuisines: string[];
  diets: DietId[];
  /**
   * Declared allergens. An empty list means the person confirmed they have none; null means the
   * question has not been answered on this account, which callers must never read as "none".
   */
  allergens: AllergenId[] | null;
  goals: GoalId[];
  /** Minutes on a typical weeknight; null means no limit. */
  timeBudgetMinutes: number | null;
  effort: Effort;
  householdSize: number;
  smallAppetite: boolean;
  units: Units;
}

export interface NotificationChoices {
  cookTimers: boolean;
  social: boolean;
  follows: boolean;
}

export type Sex = 'female' | 'male';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

/** Optional details for nutrient targets. Stored in metric; the screen converts for display. */
export interface PersonalDetails {
  heightCm: number | null;
  weightKg: number | null;
  sex: Sex | null;
  activity: ActivityLevel | null;
}

const ids = <T extends readonly (readonly [string, string])[]>(list: T) =>
  list.map(([id]) => id) as [T[number][0], ...T[number][0][]];

const uniq = <T>(values: T[]) => [...new Set(values)];

const preferencesSchema = z.object({
  cuisines: z
    .array(z.string().regex(/^[a-z][a-z_]*$/))
    .default([])
    .transform((list) => uniq(list).slice(0, MAX_LOVED_CUISINES)),
  diets: z
    .array(z.enum(ids(DIETS)))
    .default([])
    .transform(uniq),
  allergens: z
    .array(z.enum(ids(ALLERGENS)))
    .transform(uniq)
    .nullable()
    .default(null),
  goals: z
    .array(z.enum(ids(GOALS)))
    .default([])
    .transform(uniq),
  timeBudgetMinutes: z.number().int().min(5).max(1440).nullable().default(null),
  effort: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
  householdSize: z.number().int().min(1).max(20).default(2),
  smallAppetite: z.boolean().default(false),
  units: z.enum(['us', 'metric']).default('us'),
});

// Everything starts off: a choice only turns on after the system permission prompt has been
// accepted, so the switches never claim alerts that cannot be delivered.
const notificationsSchema = z.object({
  cookTimers: z.boolean().default(false),
  social: z.boolean().default(false),
  follows: z.boolean().default(false),
});

const personalDetailsSchema = z.object({
  heightCm: z.number().min(50).max(272).nullable().default(null),
  weightKg: z.number().min(20).max(400).nullable().default(null),
  sex: z.enum(['female', 'male']).nullable().default(null),
  activity: z
    .enum(['sedentary', 'light', 'moderate', 'active', 'very_active'])
    .nullable()
    .default(null),
});

export const DEFAULT_PREFERENCES: UserPreferences = preferencesSchema.parse({});
export const DEFAULT_NOTIFICATIONS: NotificationChoices = notificationsSchema.parse({});
export const EMPTY_PERSONAL_DETAILS: PersonalDetails = personalDetailsSchema.parse({});

/** Validates a personal-details value before it is stored. */
export function parsePersonalDetails(value: unknown): PersonalDetails | null {
  const parsed = personalDetailsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------------------------
// Preferences and notification choices, kept per account

interface AccountSettings {
  preferences: UserPreferences;
  notifications: NotificationChoices;
}

interface UserSettingsState {
  /** One entry per account that has used this device, keyed by user id. */
  accounts: Record<string, AccountSettings>;
}

const accountSettingsSchema = z.object({
  preferences: preferencesSchema,
  notifications: notificationsSchema,
});

const persistedSettingsSchema = z.object({
  accounts: z.record(z.string().min(1), z.unknown()),
});

/**
 * Validates what was read from storage. A damaged entry for one account is dropped on its own so
 * it cannot take every other account's choices with it.
 */
export function parsePersistedSettings(value: unknown): UserSettingsState {
  const outer = persistedSettingsSchema.safeParse(value);
  if (!outer.success) return { accounts: {} };
  const accounts: Record<string, AccountSettings> = {};
  for (const [userId, entry] of Object.entries(outer.data.accounts)) {
    const parsed = accountSettingsSchema.safeParse(entry);
    if (parsed.success) accounts[userId] = parsed.data;
    else logger.warn('Dropping stored settings that failed validation');
  }
  return { accounts };
}

const settingsStore = create<UserSettingsState>()(
  persist((): UserSettingsState => ({ accounts: {} }), {
    name: 'settings.user',
    version: 1,
    storage: persistStorage<UserSettingsState>(),
    merge: (persisted, current) => ({ ...current, ...parsePersistedSettings(persisted) }),
  }),
);

const currentUserId = () => useSessionStore.getState().userId;

const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
  preferences: DEFAULT_PREFERENCES,
  notifications: DEFAULT_NOTIFICATIONS,
};

function settingsFor(state: UserSettingsState, userId: string | null): AccountSettings {
  return (userId != null ? state.accounts[userId] : undefined) ?? DEFAULT_ACCOUNT_SETTINGS;
}

export function usePreferences(): UserPreferences {
  const userId = useSessionStore((s) => s.userId);
  return settingsStore((s) => settingsFor(s, userId).preferences);
}

export function useNotificationChoices(): NotificationChoices {
  const userId = useSessionStore((s) => s.userId);
  return settingsStore((s) => settingsFor(s, userId).notifications);
}

/** Applies `change` to the signed-in account's entry, leaving every other account untouched. */
function editAccount(change: (current: AccountSettings) => AccountSettings): void {
  const userId = currentUserId();
  if (!userId) return;
  settingsStore.setState((state) => ({
    accounts: { ...state.accounts, [userId]: change(settingsFor(state, userId)) },
  }));
}

type Patch<T> = Partial<T> | ((current: T) => Partial<T>);

const resolvePatch = <T>(patch: Patch<T>, current: T): Partial<T> =>
  typeof patch === 'function' ? patch(current) : patch;

/**
 * Saves preference changes. Pass a function to compute the change from the latest stored values,
 * which matters for anything decided after an await or a confirmation dialog.
 */
export function updatePreferences(patch: Patch<UserPreferences>): void {
  editAccount((current) => ({
    ...current,
    preferences: preferencesSchema.parse({
      ...current.preferences,
      ...resolvePatch(patch, current.preferences),
    }),
  }));
}

export function updateNotificationChoices(patch: Patch<NotificationChoices>): void {
  editAccount((current) => ({
    ...current,
    notifications: notificationsSchema.parse({
      ...current.notifications,
      ...resolvePatch(patch, current.notifications),
    }),
  }));
}

// ---------------------------------------------------------------------------------------------
// Personal details (Keychain, one entry per account)

const personalKey = (userId: string) => `famara.personal-details.${userId}`;

export async function loadPersonalDetails(): Promise<PersonalDetails> {
  const userId = currentUserId();
  if (!userId) return EMPTY_PERSONAL_DETAILS;
  try {
    const raw = await SecureStore.getItemAsync(personalKey(userId));
    if (!raw) return EMPTY_PERSONAL_DETAILS;
    return parsePersonalDetails(JSON.parse(raw)) ?? EMPTY_PERSONAL_DETAILS;
  } catch {
    logger.warn('Could not read stored personal details');
    return EMPTY_PERSONAL_DETAILS;
  }
}

export async function savePersonalDetails(details: PersonalDetails): Promise<void> {
  const userId = currentUserId();
  if (!userId) throw new Error('Not signed in');
  const valid = personalDetailsSchema.parse(details);
  await SecureStore.setItemAsync(personalKey(userId), JSON.stringify(valid), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
}

// ---------------------------------------------------------------------------------------------
// Account lifecycle

/** Detaches this device from the account's push notifications; never throws. */
export { unregisterPushDevice };

/** Everything this device holds for the signed-in account, for the data export. */
export async function collectLocalData(): Promise<Record<string, unknown>> {
  const slice = settingsFor(settingsStore.getState(), currentUserId());
  return {
    preferences: slice.preferences,
    notifications: slice.notifications,
    personalDetails: await loadPersonalDetails(),
  };
}

/** Removes this device's copy of the account's data after the account has been deleted. */
export async function clearLocalUserData(userId: string): Promise<void> {
  settingsStore.setState((state) => ({
    accounts: Object.fromEntries(Object.entries(state.accounts).filter(([id]) => id !== userId)),
  }));
  await SecureStore.deleteItemAsync(personalKey(userId)).catch(() => undefined);
}

// ---------------------------------------------------------------------------------------------
// Health

/**
 * The health feature's connections panel. Null until that feature exports one, which hides the
 * Health row in Settings entirely.
 */
export const HealthConnections: ComponentType | null = null;

/** Test hook: resets the temporary slice between tests. */
export function resetSettingsDepsForTests(): void {
  settingsStore.setState({ accounts: {} });
}
