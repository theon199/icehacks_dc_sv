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
import { defineKvKey, type KvKey } from '@/lib/storage/kv';

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
  /**
   * The account these answers belong to. Entries saved before ownership was recorded read as
   * unowned, and unowned answers are never handed to anyone.
   */
  ownerId: z.string().min(1).nullable().default(null),
  onboardingComplete: z.boolean(),
  answers: answersSchema.nullable(),
  updatedAt: z.string(),
});

type StoredPreferences = z.infer<typeof storedPreferencesSchema>;

const preferencesKey = defineKvKey('user.preferences', storedPreferencesSchema);

function blankPreferences(ownerId: string | null = null): StoredPreferences {
  return {
    ownerId,
    onboardingComplete: false,
    answers: null,
    updatedAt: new Date(0).toISOString(),
  };
}

function loadPersisted(): StoredPreferences {
  try {
    return preferencesKey.getSync() ?? blankPreferences();
  } catch {
    return blankPreferences();
  }
}

const usePreferenceSlice = create<StoredPreferences>()(() => loadPersisted());

usePreferenceSlice.subscribe((state) => {
  try {
    preferencesKey.setSync(state);
  } catch (error) {
    logger.warn('Could not save preferences', { error: String(error) });
  }
});

function ownedBy(userId: string | null | undefined): StoredPreferences | null {
  const state = usePreferenceSlice.getState();
  return userId && state.ownerId === userId ? state : null;
}

/**
 * Onboarding answers and completion, as kept by the preferences store. Every read names the
 * account asking, so answers saved by one person (allergens included) never reach another.
 */
export const preferences = {
  /**
   * Claims the stored preferences for `userId`. Anything saved for a different account, or saved
   * without an owner, is wiped first. Call before reading completion for a newly signed-in person.
   */
  adoptOwner(userId: string): void {
    const state = usePreferenceSlice.getState();
    if (state.ownerId === userId) return;
    usePreferenceSlice.setState(blankPreferences(userId), true);
  },

  isOnboardingComplete(userId: string | null): boolean {
    return ownedBy(userId)?.onboardingComplete ?? false;
  },

  subscribeOnboardingComplete(listener: (complete: boolean, ownerId: string | null) => void) {
    return usePreferenceSlice.subscribe((state, previous) => {
      if (state.onboardingComplete !== previous.onboardingComplete) {
        listener(state.onboardingComplete, state.ownerId);
      }
    });
  },

  /** Answers this account saved earlier (on this device or synced), used to prefill onboarding. */
  readAnswers(userId: string | null): OnboardingAnswers | null {
    return ownedBy(userId)?.answers ?? null;
  },

  /** Saves every answer for `userId` and marks onboarding finished. Throws on invalid answers. */
  completeOnboarding(userId: string, answers: OnboardingAnswers, now: Date = new Date()): void {
    const parsed = answersSchema.parse(answers);
    usePreferenceSlice.setState({
      ownerId: userId,
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

const consentRecordSchema = z.object({
  granted: z.boolean(),
  decidedAt: z.string(),
});

function consentRecord(userId: string): KvKey<z.infer<typeof consentRecordSchema>> {
  return defineKvKey(`user.aiConsent.${userId}`, consentRecordSchema);
}

type ConsentListener = (userId: string, granted: boolean) => void;
const consentListeners = new Set<ConsentListener>();

/**
 * Whether a person has agreed to the AI terms (PRODUCT.md §8). The settings store, and later the
 * server profile, owns this answer; until then it is kept per account on this device. Anything
 * missing or unreadable counts as "not agreed", so AI features stay closed.
 */
export const aiConsent = {
  read(userId: string): boolean {
    try {
      return consentRecord(userId).getSync()?.granted ?? false;
    } catch {
      return false;
    }
  },

  write(userId: string, granted: boolean, now: Date = new Date()): void {
    try {
      consentRecord(userId).setSync({ granted, decidedAt: now.toISOString() });
    } catch (error) {
      logger.warn('Could not save the AI consent answer', { error: String(error) });
    }
    for (const listener of consentListeners) listener(userId, granted);
  },

  subscribe(listener: ConsentListener): () => void {
    consentListeners.add(listener);
    return () => {
      consentListeners.delete(listener);
    };
  },

  /** Drops the answer for an account that no longer exists. */
  forget(userId: string): void {
    try {
      void consentRecord(userId).remove();
    } catch (error) {
      logger.warn('Could not remove the AI consent answer', { error: String(error) });
    }
  },
};

/** Removes the signed-in person's local data so the next person on this device starts clean. */
export function clearUserData(): void {
  usePreferenceSlice.setState(blankPreferences(), true);
  try {
    void preferencesKey.remove();
  } catch (error) {
    logger.warn('Could not clear saved preferences', { error: String(error) });
  }
}
