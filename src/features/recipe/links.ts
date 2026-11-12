/** Where the recipe screens send people. Kept together so route shapes are reviewed in one place. */
import type { Href } from 'expo-router';

import { nearbyHref } from '@/features/nearby';

export function recipeHref(recipeId: string): Href {
  return { pathname: '/recipe/[id]', params: { id: recipeId } };
}

export function whyHref(recipeId: string): Href {
  return { pathname: '/recipe/[id]/why', params: { id: recipeId } };
}

export function cookHref(recipeId: string): Href {
  return { pathname: '/cook/[id]', params: { id: recipeId } };
}

/** Compare a recipe with its healthier version; `to` is chosen on the compare screen when absent. */
export function compareHref(from: string, to?: string): Href {
  return { pathname: '/compare', params: to ? { from, to } : { from } };
}

export function makeoverHref(recipeId: string): Href {
  return { pathname: '/makeover', params: { recipe: recipeId } };
}

export const aiConsentHref: Href = '/ai-consent';

/**
 * Restaurants nearby that may serve the dish. The recipe id goes in the route so Nearby can look up
 * both the title and the cuisine; a bare title would lose the cuisine context of the search.
 */
export function recipeNearbyHref(recipeId: string): Href {
  return nearbyHref(recipeId);
}

/** Share a cooked dish or a remix of it with the community. */
export function composeHref(recipeId: string): Href {
  return { pathname: '/compose', params: { recipe: recipeId } };
}

export function reportHref(recipe: { id: string; title: string }): Href {
  return {
    pathname: '/moderation/report',
    params: { target: 'recipe', id: recipe.id, label: recipe.title },
  };
}

export const shoppingHref: Href = '/shopping';
export const cookbookHref: Href = '/cookbook';
export const preferencesHref: Href = '/preferences';
