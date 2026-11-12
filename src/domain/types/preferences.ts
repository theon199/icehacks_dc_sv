/**
 * A person's food preferences, collected in onboarding and edited in Preferences. Persisted locally
 * and synced, so the schema tolerates partial or older documents by filling defaults.
 */
import { z } from 'zod';

import { allergenIdSchema, type AllergenId } from './allergens';
import { cuisineIdSchema, type CuisineId } from './cuisines';
import { dietFlagNameSchema, type DietFlagName } from './diet';
import { goalSchema, type Goal } from './goals';
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
  /** Diets followed; recipes must satisfy all of them. */
  readonly diets: readonly DietFlagName[];
  /** Declared allergens; an empty list means the person explicitly has none. */
  readonly allergens: readonly AllergenId[];
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
  diets: z.array(dietFlagNameSchema).default([]).transform(unique),
  allergens: z.array(allergenIdSchema).default([]).transform(unique),
  goals: z.array(goalSchema).default([]).transform(unique),
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

/** Preferences before onboarding answers arrive: no filters, middle-of-the-road defaults. */
export const DEFAULT_PREFERENCES: UserPreferences = Object.freeze(userPreferencesSchema.parse({}));

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
