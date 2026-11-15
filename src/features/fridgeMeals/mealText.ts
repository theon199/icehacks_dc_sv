/** Words shown on, and read out for, Meals for now. Pure, so every phrase is tested. */
import { cuisineLabel, type MealTime, type MealTimePick, type RecipeSummary } from '@/domain';
import { formatGrams, formatMinutes } from '@/lib/format';

export const MEAL_LABELS: Readonly<Record<MealTime, string>> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
};

/** Catalog ingredient id → the word for it in a sentence ("paneer", "eggs"). */
export type IngredientNames = ReadonlyMap<string, string>;

type MetaFields = Pick<
  RecipeSummary,
  'cuisine' | 'totalMinutes' | 'nutrition' | 'nutritionConfidence'
>;

/**
 * "Indian · 30 min · 23g protein". A figure the recipe does not carry is left out, and estimated
 * protein says so, so no number reads as more exact than it is.
 */
export function metaLine(recipe: MetaFields): string {
  const parts = [cuisineLabel(recipe.cuisine)];
  if (recipe.totalMinutes !== null) parts.push(formatMinutes(recipe.totalMinutes));
  const protein = recipe.nutrition.proteinG;
  if (protein !== null && recipe.nutritionConfidence !== 'none') {
    const prefix = recipe.nutritionConfidence === 'estimated' ? 'Est. ' : '';
    parts.push(`${prefix}${formatGrams(protein)} protein`);
  }
  return parts.join(' · ');
}

export function totalOf(pick: MealTimePick): number {
  return pick.ownedIds.length + pick.missingIds.length;
}

export function coversAll(pick: MealTimePick): boolean {
  return pick.missingIds.length === 0;
}

/** The lime tag on a photo card when the pantry covers everything: "All 6 in". */
export function allInLabel(pick: MealTimePick): string {
  return `All ${totalOf(pick)} in`;
}

/** The tag on a list row: "You have all 6", "Need rolled oats", "Need cornmeal and 1 more". */
export function statusLabel(pick: MealTimePick, names: IngredientNames): string {
  if (coversAll(pick)) return `You have all ${totalOf(pick)}`;
  const [first, ...rest] = pick.missingIds;
  const name = first === undefined ? undefined : names.get(first);
  if (name === undefined) return `Need ${pick.missingIds.length} more`;
  return rest.length === 0 ? `Need ${name}` : `Need ${name} and ${rest.length} more`;
}

/** Most ingredients named in a "why" line before the rest are counted. */
const NAMED = 2;

/**
 * Why a top pick fits, from what is really on hand: "Uses the paneer and peas you have", or
 * "Uses the eggs, tomatoes and 2 more you have". Until the names load it counts instead.
 */
export function whyLine(pick: MealTimePick, names: IngredientNames): string {
  const owned = pick.ownedIds.length;
  const known = pick.ownedIds.flatMap((id) => {
    const name = names.get(id);
    return name === undefined ? [] : [name];
  });
  if (known.length === 0) return `Uses ${owned} ${owned === 1 ? 'thing' : 'things'} you have`;
  const shown = known.slice(0, NAMED);
  const rest = owned - shown.length;
  if (rest === 0) return `Uses the ${shown.join(' and ')} you have`;
  return `Uses the ${shown.join(', ')} and ${rest} more you have`;
}

/** One sentence VoiceOver reads for a card or row. */
export function pickAccessibilityLabel(
  pick: MealTimePick,
  names: IngredientNames,
  detail: 'why' | 'status',
): string {
  const parts = [pick.recipe.title, metaLine(pick.recipe)];
  if (detail === 'why') {
    if (coversAll(pick)) parts.push(`All ${totalOf(pick)} ingredients in`);
    parts.push(whyLine(pick, names));
  } else {
    parts.push(statusLabel(pick, names));
  }
  return parts.join('. ');
}

/** Ingredient ids whose names the screen shows: owned ones for the top picks, the first gap. */
export function namedIngredientIds(picks: readonly MealTimePick[], topCount: number): string[] {
  const ids = new Set<string>();
  picks.forEach((pick, index) => {
    if (index < topCount) for (const id of pick.ownedIds.slice(0, NAMED)) ids.add(id);
    const gap = pick.missingIds[0];
    if (gap !== undefined) ids.add(gap);
  });
  return [...ids].sort();
}
