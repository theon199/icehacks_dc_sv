/**
 * Everything Meals for now reads from outside its folder. Stored preferences and catalog
 * candidates reach the ranking domain through the app-wide bridges, which keep safety fail-closed:
 * anything they cannot map reads as "unanswered", never as "no restrictions".
 */
import type { Href } from 'expo-router';

import { selectCanUseAi, selectIsAdult, useSessionStore } from '@/features/auth';
import { snapCameraHref } from '@/features/snap';

export { myRecipeHref, useMyRecipesForMeal, type MyRecipeSuggestion } from '@/features/myRecipes';

export { toDomainRecipe as toRankRecipe } from '@/lib/catalog';
export { toUserPreferences as toRankPreferences } from '@/stores/domainBridge';

/** The Snap camera on its pantry mode, where an empty fridge gets filled. */
export const SNAP_PANTRY_HREF: Href = snapCameraHref({ mode: 'pantry' });

/**
 * Whether Snap can be offered. It is an AI feature, open only to adults who agreed to the AI
 * terms: an adult who has not agreed is asked first, and anyone younger is not offered it.
 */
export type SnapAccess = 'open' | 'needsConsent' | 'unavailable';

export function useSnapAccess(): SnapAccess {
  return useSessionStore((state) => {
    if (!selectIsAdult(state)) return 'unavailable';
    return selectCanUseAi(state) ? 'open' : 'needsConsent';
  });
}
