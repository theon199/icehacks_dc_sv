/**
 * The shared modules onboarding reads and writes: the bundled catalog (`@/lib/catalog`) for the
 * cuisine and pantry questions, and the per-account user stores (`@/stores`) the answers land in.
 * The rest of the app reads those same stores, so the answers are what it sees.
 */
import { getCuisines, getIngredients, type Ingredient } from '@/lib/catalog';
import { preferencesSchema, usePantryStore, usePreferencesStore } from '@/stores';

import type { OnboardingAnswers } from './onboardingModel';
import { answersFromPreferences, toPreferencesPatch } from './preferencesMapping';

/** Ingredients most kitchens keep on hand, read through the catalog's shared, cached query. */
export { usePantryStaples } from '@/lib/catalog';

export interface CuisineOption {
  /** Catalog cuisine id, e.g. `west_african`. */
  id: string;
  /** Catalog region id, e.g. `sub_saharan_africa`. */
  region: string;
  recipeCount: number;
}

export type PantryStaple = Pick<Ingredient, 'id' | 'name' | 'category'>;

/** Every cuisine with at least one recipe, once each, with its region. */
export async function loadCuisineOptions(): Promise<CuisineOption[]> {
  const cuisines = await getCuisines();
  return cuisines.map(({ cuisine, region, recipeCount }) => ({ id: cuisine, region, recipeCount }));
}

/**
 * Pantry staples in display order, by category then name, using the reader's collation rather than
 * SQLite's byte order. Returns a new array: the input is a cached query result shared with other
 * screens and must not be reordered in place.
 */
export function sortStaplesForDisplay<T extends PantryStaple>(staples: readonly T[]): T[] {
  return [...staples].sort(
    (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  );
}

/** Answers this account already has, used to prefill the questionnaire. */
export function readSavedAnswers(): OnboardingAnswers | null {
  return answersFromPreferences(usePreferencesStore.getState().prefs);
}

/** The catalog ingredients behind the chosen pantry starters. */
export async function loadPantryStarters(ids: readonly string[]): Promise<PantryStaple[]> {
  return ids.length > 0 ? getIngredients(ids) : [];
}

/**
 * Saves the answers to the preferences store, adds the starters to the pantry and marks onboarding
 * complete, in that order, so completion is only ever seen with the answers in place. Throws,
 * leaving onboarding open and the stores untouched, when the answers do not fit the preferences
 * document.
 */
export function saveOnboarding(
  answers: OnboardingAnswers,
  starters: readonly PantryStaple[],
): void {
  const store = usePreferencesStore.getState();
  const patch = toPreferencesPatch(answers);
  // The store ignores an invalid update silently; check first so a bad answer is reported.
  preferencesSchema.parse({ ...store.prefs, ...patch, allergens: answers.allergens });

  store.update(patch);
  store.setAllergens(answers.allergens);
  usePantryStore.getState().addMany(
    starters.map((ingredient) => ({
      ingredientId: ingredient.id,
      name: ingredient.name,
      category: ingredient.category,
    })),
  );
  store.completeOnboarding();
}
