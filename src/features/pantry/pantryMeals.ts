/**
 * "Meals you can make": catalog recipes ranked in the recommendation domain's pantry mode, which
 * keeps only dishes whose core ingredients are mostly on hand and never shows anything unsafe for
 * the person's allergens or diets.
 */
import { buildDeck, type RecipeSummary, type UserPreferences } from '@/domain';
import type { RecipeCandidate } from '@/lib/catalog';

import { toRankRecipe } from './deps';

export interface PantryMeal {
  readonly recipe: RecipeSummary;
  /** Core ingredients on hand, out of `total`. */
  readonly have: number;
  readonly total: number;
  /** Up to three core ingredient ids still missing. */
  readonly missing: readonly string[];
}

export interface PantryMealsInput {
  /** Catalog candidates; their core ingredients already leave out staples and optional lines. */
  readonly candidates: readonly RecipeCandidate[];
  readonly pantry: ReadonlySet<string>;
  readonly prefs: UserPreferences;
  /** Epoch milliseconds. */
  readonly now: number;
  readonly size: number;
}

/** Same pantry, same order: the list should not reshuffle every time the screen opens. */
const SEED = 'pantry-meals';

export function rankPantryMeals(input: PantryMealsInput): PantryMeal[] {
  if (input.pantry.size === 0 || input.candidates.length === 0) return [];
  const recipes = input.candidates.map(toRankRecipe);
  const deck = buildDeck({
    candidates: recipes,
    prefs: input.prefs,
    now: input.now,
    pantry: input.pantry,
    mode: 'pantry',
    seed: SEED,
    size: input.size,
  });
  return deck.cards.map((card) => {
    const core = card.recipe.coreIngredientIds;
    const missing = core.filter((id) => !input.pantry.has(id));
    return {
      recipe: card.recipe,
      have: core.length - missing.length,
      total: core.length,
      missing: missing.slice(0, 3),
    };
  });
}
