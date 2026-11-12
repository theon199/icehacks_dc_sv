/**
 * A person's food preferences, collected in onboarding and edited in Preferences. Persisted locally
 * and synced, so the schema tolerates partial or older documents by filling defaults.
 *
 * Safety-critical answers are the exception. `allergens` and `diets` default to `null`, meaning
 * "not answered yet", never to an empty list: a document that lost the field (an older client, a
 * partial write, a sync bug) must not read as "no allergies". The safety filter treats `null` as
 * unanswered and admits no recipe until the person answers (see `compileSafetyRules`).
 *
 * Parsing is strict about vocabulary: one allergen or diet id this build does not know (for example
 * written by a newer client) fails the whole parse. Callers must surface that failure or keep the
 * last good document; they must never fall back to a hand-built object with `allergens: []`.
 * Falling back to `DEFAULT_PREFERENCES` is safe because its safety answers are `null`.
 */
import { z } from 'zod';

import { allergenIdSchema, type AllergenId } from './allergens';
import { cuisineIdSchema, type CuisineId } from './cuisines';
import { dietFlagNameSchema, type DietFlagName } from './diet';
import { goalIdSchema, type Goal } from './goals';
import { effortSchema, type Effort } from './recipe';

export const MAX_LOVED_CUISINES = 5;

/** Choices offered for the weeknight cooking time budget, in minutes. */
export const TIME_BUDGET_CHOICES = [15, 30, 45, 60] as const;

export const EFFORT_LABELS: Readonly<Record<Effort, string>> = {
  1: 'Keep it easy',
  2: 'Some effort is fine',
  3: 'I enjoy involved cooking',
};

export type Units = 'us' | 'metric';

export interface UserPreferences {
  /** Loved cuisines, most loved first (at most five). */
  readonly cuisines: readonly CuisineId[];
  /**
   * Diets followed; recipes must satisfy all of them. An empty list means the person follows none;
   * `null` means they have not answered, and no recipe is treated as safe yet.
   */
  readonly diets: readonly DietFlagName[] | null;
  /**
   * Declared allergens. An empty list means the person explicitly has none; `null` means they have
   * not answered, and no recipe is treated as safe yet.
   */
  readonly allergens: readonly AllergenId[] | null;
  readonly goals: readonly Goal[];
  /** Minutes available on a typical weeknight; null means no limit. */
  readonly timeBudgetMinutes: number | null;
  /** The most involved cooking the person is happy with. */
  readonly effort: Effort;
  readonly householdSize: number;
  readonly smallAppetite: boolean;
  readonly units: Units;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export const userPreferencesSchema = z.object({
  cuisines: z
    .array(cuisineIdSchema)
    .default([])
    .transform((ids) => unique(ids).slice(0, MAX_LOVED_CUISINES)),
  // Missing safety answers become null ("unanswered"), never an empty list.
  diets: z.array(dietFlagNameSchema).transform(unique).nullable().default(null),
  allergens: z.array(allergenIdSchema).transform(unique).nullable().default(null),
  goals: z.array(goalIdSchema).default([]).transform(unique),
  timeBudgetMinutes: z
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .nullable()
    .default(null),
  effort: effortSchema.default(2),
  householdSize: z.number().int().min(1).max(20).default(2),
  smallAppetite: z.boolean().default(false),
  units: z.enum(['us', 'metric']).default('us'),
});

/**
 * Preferences before onboarding answers arrive: middle-of-the-road defaults, with allergens and
 * diets unanswered so nothing is shown as safe until the person tells us.
 */
export const DEFAULT_PREFERENCES: UserPreferences = Object.freeze(userPreferencesSchema.parse({}));

/** True once the person has answered both safety questions (an empty answer counts). */
export function hasSafetyAnswers(prefs: Pick<UserPreferences, 'allergens' | 'diets'>): boolean {
  return prefs.allergens !== null && prefs.diets !== null;
}

export interface UserProfile {
  readonly userId: string;
  readonly displayName: string;
  readonly birthYear: number | null;
  readonly preferences: UserPreferences;
  /** Epoch milliseconds of the last local change, for last-write-wins sync. */
  readonly updatedAt: number;
}

export const userProfileSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().trim().max(60).default(''),
  birthYear: z.number().int().min(1900).max(2100).nullable().default(null),
  preferences: userPreferencesSchema.default(() => userPreferencesSchema.parse({})),
  updatedAt: z.number().int().nonnegative(),
});
