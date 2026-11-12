/**
 * Builds a makeover request from a catalog recipe and lists the parts of an answer that the local
 * allergen check reads.
 */
import type { MakeoverRequest, MakeoverResponse } from '@/lib/api/ai';
import type { RecipeDetail } from '@/lib/catalog';
import { HEALTH_GOALS, type HealthGoal, type Preferences } from '@/stores';

import type { AllergenId } from '@/domain/types/allergens';

import {
  findAllergenMentions,
  mentionRoot,
  type AllergenHit,
  type CheckedText,
} from './allergenCheck';

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

type CheckedMakeover = Pick<MakeoverResponse, 'title' | 'ingredients' | 'steps' | 'swaps' | 'note'>;

const NOTE = 'Note';

/** The parts of a makeover that must not name a declared allergen (not what was swapped out). */
export function checkedTexts(makeover: CheckedMakeover): CheckedText[] {
  return [
    { where: 'Title', text: makeover.title },
    ...makeover.ingredients.map((text, index) => ({ where: `Ingredient ${index + 1}`, text })),
    ...makeover.steps.map((text, index) => ({ where: `Step ${index + 1}`, text })),
    ...makeover.swaps.map((swap, index) => ({ where: `Swap ${index + 1}`, text: swap.to })),
    { where: NOTE, text: makeover.note },
  ];
}

const mentionKey = (hit: Pick<AllergenHit, 'allergen' | 'found'>) =>
  `${hit.allergen}:${mentionRoot(hit.found)}`;

/**
 * Declared allergens the makeover still mentions. The note may name what a swap took out ("the
 * butter is now olive oil", "just as creamy" after cream was swapped out), so a mention in the
 * note only counts when no swap removed that ingredient; the
 * title, ingredients, steps and swap replacements are always held to every mention.
 */
export function makeoverAllergenHits(
  makeover: CheckedMakeover,
  allergens: readonly AllergenId[],
): AllergenHit[] {
  const removed = new Set(
    findAllergenMentions(
      makeover.swaps.map((swap) => ({ where: 'Removed', text: swap.from })),
      allergens,
    ).map(mentionKey),
  );
  return findAllergenMentions(checkedTexts(makeover), allergens).filter(
    (hit) => hit.where !== NOTE || !removed.has(mentionKey(hit)),
  );
}
