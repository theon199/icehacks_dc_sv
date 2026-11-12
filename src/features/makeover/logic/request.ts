/**
 * Builds a makeover request from a catalog recipe and lists the parts of an answer that the local
 * allergen check reads.
 */
import type { MakeoverRequest, MakeoverResponse } from '@/lib/api/ai';
import type { RecipeDetail } from '@/lib/catalog';
import { HEALTH_GOALS, type HealthGoal, type Preferences } from '@/stores';

import type { CheckedText } from './allergenCheck';

export const MAX_REQUEST_CHARS = 300;

export const GOAL_LABELS: Readonly<Record<HealthGoal, string>> = {
  more_protein: 'More protein',
  more_fiber: 'More fiber',
  lower_sodium: 'Less salt',
  heart_friendly: 'Heart-friendly',
  lighter_meals: 'Lighter',
  plant_forward: 'More plants',
  steadier_energy: 'Steadier energy',
};

export const MAKEOVER_GOALS: readonly HealthGoal[] = HEALTH_GOALS;

function oneLine(text: string, max: number): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length > max ? clean.slice(0, max).trimEnd() : clean;
}

function linesOf<T extends { position: number; text: string }>(
  items: readonly T[],
  max: number,
  count: number,
): string[] {
  return [...items]
    .sort((a, b) => a.position - b.position)
    .map((item) => oneLine(item.text, max))
    .filter(Boolean)
    .slice(0, count);
}

/** The request, or null when the recipe has no ingredients or steps to work with. */
export function makeoverRequestFrom(
  recipe: RecipeDetail,
  prefs: Preferences,
  goals: readonly HealthGoal[],
  wish: string,
): MakeoverRequest | null {
  const ingredients = linesOf(recipe.ingredients, 200, 60);
  const steps = linesOf(recipe.steps, 1000, 40);
  if (ingredients.length === 0 || steps.length === 0) return null;
  const request = oneLine(wish, MAX_REQUEST_CHARS);
  return {
    recipe: {
      title: oneLine(recipe.title, 160) || 'Recipe',
      servings: Math.min(24, Math.max(1, Math.round(recipe.servings))),
      ingredients,
      steps,
    },
    goals: [...goals],
    diet: [...prefs.diets],
    allergens: [...prefs.allergens],
    ...(request ? { request } : {}),
  };
}

/** The parts of a makeover that must not name a declared allergen (not what was swapped out). */
export function checkedTexts(
  makeover: Pick<MakeoverResponse, 'title' | 'ingredients' | 'steps' | 'swaps' | 'note'>,
): CheckedText[] {
  return [
    { where: 'Title', text: makeover.title },
    ...makeover.ingredients.map((text, index) => ({ where: `Ingredient ${index + 1}`, text })),
    ...makeover.steps.map((text, index) => ({ where: `Step ${index + 1}`, text })),
    ...makeover.swaps.map((swap, index) => ({ where: `Swap ${index + 1}`, text: swap.to })),
    { where: 'Note', text: makeover.note },
  ];
}
