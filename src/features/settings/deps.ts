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
  /** Declared allergens; empty means the person said they have none. */
  allergens: AllergenId[];
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
    .default([])
    .transform(uniq),
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

const notificationsSchema = z.object({
  cookTimers: z.boolean().default(true),
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
// Preferences and notification choices

interface UserSettingsState {
  /** Account the stored values belong to, so another sign-in on this device starts fresh. */
  ownerId: string | null;
  preferences: UserPreferences;
  notifications: NotificationChoices;
}

const settingsStore = create<UserSettingsState>()(
  persist(
    (): UserSettingsState => ({
      ownerId: null,
      preferences: DEFAULT_PREFERENCES,
      notifications: DEFAULT_NOTIFICATIONS,
    }),
    {
      name: 'settings.user',
      version: 1,
      storage: persistStorage<UserSettingsState>(),
      merge: (persisted, current) => {
        const raw = (persisted ?? {}) as Partial<UserSettingsState>;
        const preferences = preferencesSchema.safeParse(raw.preferences ?? {});
        const notifications = notificationsSchema.safeParse(raw.notifications ?? {});
        return {
          ...current,
          ownerId: typeof raw.ownerId === 'string' ? raw.ownerId : null,
          preferences: preferences.success ? preferences.data : DEFAULT_PREFERENCES,
          notifications: notifications.success ? notifications.data : DEFAULT_NOTIFICATIONS,
        };
      },
    },
  ),
);

const currentUserId = () => useSessionStore.getState().userId;

/** Values for the signed-in account, falling back to defaults for anyone else's leftovers. */
function ownedSlice(state: UserSettingsState, userId: string | null) {
  return state.ownerId != null && state.ownerId === userId
    ? state
    : { preferences: DEFAULT_PREFERENCES, notifications: DEFAULT_NOTIFICATIONS };
}

export function usePreferences(): UserPreferences {
  const userId = useSessionStore((s) => s.userId);
  return settingsStore((s) => ownedSlice(s, userId).preferences);
}

export function useNotificationChoices(): NotificationChoices {
  const userId = useSessionStore((s) => s.userId);
  return settingsStore((s) => ownedSlice(s, userId).notifications);
}

function writeSlice(patch: Partial<Pick<UserSettingsState, 'preferences' | 'notifications'>>) {
  const userId = currentUserId();
  if (!userId) return;
  const current = ownedSlice(settingsStore.getState(), userId);
  settingsStore.setState({
    ownerId: userId,
    preferences: current.preferences,
    notifications: current.notifications,
    ...patch,
  });
}

export function updatePreferences(patch: Partial<UserPreferences>): void {
  const userId = currentUserId();
  const base = ownedSlice(settingsStore.getState(), userId).preferences;
  writeSlice({ preferences: preferencesSchema.parse({ ...base, ...patch }) });
}

export function updateNotificationChoices(patch: Partial<NotificationChoices>): void {
  const userId = currentUserId();
  const base = ownedSlice(settingsStore.getState(), userId).notifications;
  writeSlice({ notifications: { ...base, ...patch } });
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

/** Everything this device holds for the signed-in account, for the data export. */
export async function collectLocalData(): Promise<Record<string, unknown>> {
  const userId = currentUserId();
  const slice = ownedSlice(settingsStore.getState(), userId);
  return {
    preferences: slice.preferences,
    notifications: slice.notifications,
    personalDetails: await loadPersonalDetails(),
  };
}

/** Removes this device's copy of the account's data after the account has been deleted. */
export async function clearLocalUserData(userId: string): Promise<void> {
  if (settingsStore.getState().ownerId === userId) {
    settingsStore.setState({
      ownerId: null,
      preferences: DEFAULT_PREFERENCES,
      notifications: DEFAULT_NOTIFICATIONS,
    });
  }
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
  settingsStore.setState({
    ownerId: null,
    preferences: DEFAULT_PREFERENCES,
    notifications: DEFAULT_NOTIFICATIONS,
  });
}
