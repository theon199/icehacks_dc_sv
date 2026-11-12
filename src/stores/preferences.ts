/**
 * Food preferences from onboarding, editable later in Preferences. Synced as one document.
 *
 * The birth year is deliberately not here: the server account is its source of truth.
 */
import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  ALLERGEN_IDS,
  DIET_IDS,
  dietMask,
  type AllergenId,
  type DietId,
} from '@/lib/catalog/types';

import { createSelector, singletonRecord } from './memo';
import { versionedPersist } from './persistence';
import { createCollectionAdapter } from './syncAdapter';

export const HEALTH_GOALS = [
  'more_protein',
  'more_fiber',
  'lower_sodium',
  'heart_friendly',
  'lighter_meals',
  'plant_forward',
  'steadier_energy',
] as const;
export type HealthGoal = (typeof HEALTH_GOALS)[number];

export const MAX_CUISINES = 5;

export const preferencesSchema = z.object({
  displayName: z.string().trim().min(1).max(50).nullable(),
  cuisines: z.array(z.string().min(1).max(40)).max(MAX_CUISINES),
  diets: z.array(z.enum(DIET_IDS)),
  allergens: z.array(z.enum(ALLERGEN_IDS)),
  /** True once the person has answered the allergen question, including an explicit "none". */
  allergensAnswered: z.boolean(),
  goals: z.array(z.enum(HEALTH_GOALS)),
  /** Usual cooking time budget in minutes; null means no limit. */
  maxMinutes: z.number().int().min(5).max(600).nullable(),
  /** Preferred effort: 1 easy, 2 medium, 3 involved; null means any. */
  effort: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  householdSize: z.number().int().min(1).max(20),
  smallAppetite: z.boolean(),
  onboardedAt: z.string().nullable(),
});
export type Preferences = z.infer<typeof preferencesSchema>;

export const defaultPreferences: Preferences = {
  displayName: null,
  cuisines: [],
  diets: [],
  allergens: [],
  allergensAnswered: false,
  goals: [],
  maxMinutes: null,
  effort: null,
  householdSize: 1,
  smallAppetite: false,
  onboardedAt: null,
};

// --- Pure transitions --------------------------------------------------------------------------

function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/** Returns `prefs` itself when nothing changes, so no new sync version is made. */
export function updatePreferences(prefs: Preferences, patch: Partial<Preferences>): Preferences {
  const candidate = preferencesSchema.safeParse({ ...prefs, ...patch });
  if (!candidate.success) return prefs;
  const next = candidate.data;
  const unchanged = (Object.keys(next) as (keyof Preferences)[]).every((key) => {
    const a = prefs[key];
    const b = next[key];
    return Array.isArray(a) && Array.isArray(b) ? sameList(a, b) : a === b;
  });
  return unchanged ? prefs : next;
}

export function withCuisines(prefs: Preferences, cuisines: readonly string[]): Preferences {
  return updatePreferences(prefs, { cuisines: unique(cuisines).slice(0, MAX_CUISINES) });
}

export function toggleCuisine(prefs: Preferences, cuisine: string): Preferences {
  const has = prefs.cuisines.includes(cuisine);
  if (!has && prefs.cuisines.length >= MAX_CUISINES) return prefs;
  return withCuisines(
    prefs,
    has ? prefs.cuisines.filter((c) => c !== cuisine) : [...prefs.cuisines, cuisine],
  );
}

export function toggleDiet(prefs: Preferences, diet: DietId): Preferences {
  const diets = prefs.diets.includes(diet)
    ? prefs.diets.filter((d) => d !== diet)
    : [...prefs.diets, diet];
  return updatePreferences(prefs, { diets });
}

/** Records the allergen answer; an empty list is an explicit "none". */
export function withAllergens(prefs: Preferences, allergens: readonly AllergenId[]): Preferences {
  return updatePreferences(prefs, { allergens: unique(allergens), allergensAnswered: true });
}

export function toggleGoal(prefs: Preferences, goal: HealthGoal): Preferences {
  const goals = prefs.goals.includes(goal)
    ? prefs.goals.filter((g) => g !== goal)
    : [...prefs.goals, goal];
  return updatePreferences(prefs, { goals });
}

// --- Store -------------------------------------------------------------------------------------

export interface PreferencesState {
  prefs: Preferences;
  update: (patch: Partial<Preferences>) => void;
  setCuisines: (cuisines: readonly string[]) => void;
  toggleCuisine: (cuisine: string) => void;
  toggleDiet: (diet: DietId) => void;
  setAllergens: (allergens: readonly AllergenId[]) => void;
  toggleGoal: (goal: HealthGoal) => void;
  completeOnboarding: (at?: string) => void;
  reset: () => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => {
      const apply = (next: Preferences) => {
        if (next !== get().prefs) set({ prefs: next });
      };
      return {
        prefs: defaultPreferences,
        update: (patch) => apply(updatePreferences(get().prefs, patch)),
        setCuisines: (cuisines) => apply(withCuisines(get().prefs, cuisines)),
        toggleCuisine: (cuisine) => apply(toggleCuisine(get().prefs, cuisine)),
        toggleDiet: (diet) => apply(toggleDiet(get().prefs, diet)),
        setAllergens: (allergens) => apply(withAllergens(get().prefs, allergens)),
        toggleGoal: (goal) => apply(toggleGoal(get().prefs, goal)),
        completeOnboarding: (at = new Date().toISOString()) =>
          apply(updatePreferences(get().prefs, { onboardedAt: get().prefs.onboardedAt ?? at })),
        reset: () => set({ prefs: defaultPreferences }),
      };
    },
    versionedPersist({
      name: 'user.preferences',
      version: 1,
      schema: z.object({ prefs: preferencesSchema }),
      partialize: (state) => ({ prefs: state.prefs }),
    }),
  ),
);

// --- Selectors ---------------------------------------------------------------------------------

export const selectPreferences = (state: PreferencesState) => state.prefs;
export const selectAvoidAllergens = (state: PreferencesState) => state.prefs.allergens;
export const selectHasAnsweredAllergens = (state: PreferencesState) =>
  state.prefs.allergensAnswered;
export const selectSmallAppetite = (state: PreferencesState) => state.prefs.smallAppetite;
export const selectIsOnboarded = (state: PreferencesState) => state.prefs.onboardedAt != null;
/** Catalog `diet_flags` mask every recommendation must satisfy. */
export const selectDietMask = createSelector(
  (state: PreferencesState) => state.prefs.diets,
  (diets) => dietMask(diets),
);

// --- Sync --------------------------------------------------------------------------------------

const asDocs = singletonRecord<Preferences>('main');

export const preferencesSync = createCollectionAdapter({
  collection: 'preferences',
  store: usePreferencesStore,
  select: (state) => asDocs(state.prefs),
  schema: preferencesSchema,
  // A singleton is never deleted remotely; a stray tombstone leaves the local copy to be re-sent.
  apply: (state, { upserts }) => ({ prefs: upserts.main ?? state.prefs }),
});
