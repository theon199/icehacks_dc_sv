/** Short display lines for a recipe: "Filipino · 45 min · serves 4". */
import { MY_RECIPE_MEALS, type MyRecipeMeal, type MyRecipeSource } from '@/stores';

export const MY_MEALS: readonly MyRecipeMeal[] = MY_RECIPE_MEALS;

export const MEAL_LABELS: Readonly<Record<MyRecipeMeal, string>> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export const SOURCE_LABELS: Readonly<Record<MyRecipeSource['kind'], string>> = {
  link: 'From a link',
  photo: 'From a recipe card',
  text: 'In your words',
};

export function recipeMeta(
  recipe: { cuisine: string | null; minutes: number | null; servings: number },
  formatMinutes: (minutes: number) => string,
): string {
  return [
    recipe.cuisine,
    recipe.minutes !== null ? formatMinutes(recipe.minutes) : null,
    `serves ${recipe.servings}`,
  ]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ');
}

/** "Need bay leaves", "Need 4 things", or null when nothing is missing. */
export function missingText(missing: readonly string[]): string | null {
  if (missing.length === 0) return null;
  if (missing.length === 1) return `Need ${missing[0]}`;
  if (missing.length === 2) return `Need ${missing[0]} and ${missing[1]}`;
  return `Need ${missing.length} things`;
}

/** The host of a link, for "From seriouseats.com". */
export function linkHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
