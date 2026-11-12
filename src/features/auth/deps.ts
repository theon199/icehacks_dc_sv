/**
 * The narrow slice of user data the account flow needs: onboarding answers (the preferences store),
 * background sync, and wiping a person's data from the device on sign-out.
 *
 * This file is the only place auth and setup touch those modules. Its shapes follow docs/PRODUCT.md
 * §2 and docs/ARCHITECTURE.md (user data is local-first and synced through `user_documents`). The
 * implementation below is a small self-contained stand-in until the shared user stores and sync
 * engine land; replacing it with them is a change to this file only.
 */
import { z } from 'zod';
import { create } from 'zustand';

import { logger } from '@/lib/logger';
import { defineKvKey } from '@/lib/storage/kv';

export const ALLERGEN_IDS = [
  'milk',
  'egg',
  'fish',
  'shellfish',
  'tree_nut',
  'peanut',
  'wheat',
  'soy',
  'sesame',
  'gluten',
] as const;
export type AllergenId = (typeof ALLERGEN_IDS)[number];

export const DIET_IDS = [
  'vegetarian',
  'vegan',
  'pescatarian',
  'no_pork',
  'no_beef',
  'no_alcohol',
  'halal_friendly',
  'gluten_free',
  'dairy_free',
] as const;
export type DietId = (typeof DIET_IDS)[number];

export const GOAL_IDS = [
  'more_protein',
  'more_fiber',
  'lower_sodium',
  'heart_friendly',
  'lighter_meals',
  'plant_forward',
  'steady_energy',
] as const;
export type GoalId = (typeof GOAL_IDS)[number];

export const EFFORT_LEVELS = ['easy', 'moderate', 'involved'] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

export const MAX_CUISINES = 5;
export const MAX_HOUSEHOLD = 12;

const answersSchema = z.object({
  displayName: z.string().trim().min(1).max(50).nullable(),
  cuisines: z.array(z.string().min(1)).max(MAX_CUISINES),
  diets: z.array(z.enum(DIET_IDS)),
  /** An empty list is an explicit "no allergies", given on its own screen. */
  allergens: z.array(z.enum(ALLERGEN_IDS)),
  goals: z.array(z.enum(GOAL_IDS)),
  /** Longest a typical weekday cook should take, in minutes; null for no limit. */
  maxMinutes: z.number().int().positive().nullable(),
  effort: z.enum(EFFORT_LEVELS).nullable(),
  householdSize: z.number().int().min(1).max(MAX_HOUSEHOLD),
  pantryStaples: z.array(z.string().min(1)),
  smallAppetite: z.boolean(),
});

export type OnboardingAnswers = z.infer<typeof answersSchema>;

const storedPreferencesSchema = z.object({
  onboardingComplete: z.boolean(),
  answers: answersSchema.nullable(),
  updatedAt: z.string(),
});

type StoredPreferences = z.infer<typeof storedPreferencesSchema>;

const preferencesKey = defineKvKey('user.preferences', storedPreferencesSchema);

const emptyPreferences: StoredPreferences = {
  onboardingComplete: false,
  answers: null,
  updatedAt: new Date(0).toISOString(),
};

function readStored(): StoredPreferences {
  try {
    return preferencesKey.getSync() ?? emptyPreferences;
  } catch {
    return emptyPreferences;
  }
}

const usePreferenceSlice = create<StoredPreferences>()(() => readStored());

usePreferenceSlice.subscribe((state) => {
  try {
    preferencesKey.setSync(state);
  } catch (error) {
    logger.warn('Could not save preferences', { error: String(error) });
  }
});

/** Onboarding answers and completion, as kept by the preferences store. */
export const preferences = {
  isOnboardingComplete(): boolean {
    return usePreferenceSlice.getState().onboardingComplete;
  },

  subscribeOnboardingComplete(listener: (complete: boolean) => void): () => void {
    return usePreferenceSlice.subscribe((state, previous) => {
      if (state.onboardingComplete !== previous.onboardingComplete) {
        listener(state.onboardingComplete);
      }
    });
  },

  /** Answers saved earlier (from this device or synced), used to prefill onboarding. */
  readAnswers(): OnboardingAnswers | null {
    return usePreferenceSlice.getState().answers;
  },

  /** Saves every answer and marks onboarding finished. Throws on answers that fail validation. */
  completeOnboarding(answers: OnboardingAnswers, now: Date = new Date()): void {
    const parsed = answersSchema.parse(answers);
    usePreferenceSlice.setState({
      onboardingComplete: true,
      answers: parsed,
      updatedAt: now.toISOString(),
    });
  },
};

/** Background sync of the signed-in person's documents. */
export const sync = {
  start(userId: string): void {
    logger.debug('Sync start requested', { userId });
  },
  stop(): void {
    logger.debug('Sync stop requested');
  },
};

/** Removes the signed-in person's local data so the next person on this device starts clean. */
export function clearUserData(): void {
  usePreferenceSlice.setState(emptyPreferences, true);
  try {
    void preferencesKey.remove();
  } catch (error) {
    logger.warn('Could not clear saved preferences', { error: String(error) });
  }
}
