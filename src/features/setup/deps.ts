/**
 * The shared modules onboarding reads and writes: the bundled catalog (`@/lib/catalog`) for the
 * cuisine and pantry questions, and the per-account user stores (`@/stores`) the answers land in.
 * The rest of the app reads those same stores, so the answers are what it sees.
 */
import { z } from 'zod';

import { getCuisines, getIngredients, type Ingredient } from '@/lib/catalog';
import { catalogPreparedQuery } from '@/lib/db/catalog';
import { preferencesSchema, usePantryStore, usePreferencesStore } from '@/stores';

import type { OnboardingAnswers } from './onboardingModel';
import { answersFromPreferences, toPreferencesPatch } from './preferencesMapping';

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

const STAPLE_IDS_SQL = 'SELECT id FROM ingredients WHERE pantry_staple = 1';

/** Ingredients most kitchens already have, offered as a quick start for the pantry. */
export async function loadPantryStaples(): Promise<PantryStaple[]> {
  // The typed catalog module has no staple listing, so only the ids are read here; the
  // ingredients themselves come through it (validated and cached).
  const rows = await catalogPreparedQuery(STAPLE_IDS_SQL, [], z.object({ id: z.string().min(1) }));
  const staples = await getIngredients(rows.map((row) => row.id));
  return staples
    .filter((ingredient) => ingredient.pantryStaple)
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
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
