/**
 * Catalog rows in the shapes the pure domain (`src/domain`) works with. The catalog types mirror
 * the database (docs/DATA.md); the domain types are stricter about a few fields, and this is the
 * only place that reconciles the two:
 *
 * - a region this build does not list becomes `global`, never an unlabelled value;
 * - missing nutrition (`nutritionConfidence: 'none'`) becomes a record of unknown values;
 * - core ingredients come from the candidate query, which applies the catalog's rule in SQL.
 *
 * Allergen maps pass through untouched: the catalog already reports anything unreadable as
 * `unknown`, which the domain's safety filter treats as unsafe.
 */
import { isRegionId } from '@/domain/types/cuisines';
import type { Nutrition, RecipeSummary as DomainRecipe } from '@/domain/types/recipe';

import type { Ingredient, RecipeCandidate, RecipeIngredientLine, RecipeSummary } from './types';

const NO_NUTRITION: Nutrition = Object.freeze({
  kcal: null,
  proteinG: null,
  carbsG: null,
  fatG: null,
  satFatG: null,
  fiberG: null,
  sugarG: null,
  addedSugarG: null,
  sodiumMg: null,
});

const NO_INGREDIENTS: readonly string[] = Object.freeze([]);

/**
 * A catalog summary or candidate as the domain's recipe summary. A plain summary carries no
 * ingredient data, so its core ingredients are empty; pass a candidate (or set them from
 * `coreIngredientIdsOf`) wherever pantry coverage or similarity matters.
 *
 * Takes exactly one argument so it can be handed straight to `Array.prototype.map`.
 */
export function toDomainRecipe(recipe: RecipeSummary | RecipeCandidate): DomainRecipe {
  return {
    id: recipe.id,
    slug: recipe.slug,
    title: recipe.title,
    summary: recipe.summary,
    cuisine: recipe.cuisine,
    region: isRegionId(recipe.region) ? recipe.region : 'global',
    course: recipe.course,
    totalMinutes: recipe.totalMinutes,
    activeMinutes: recipe.activeMinutes,
    servings: recipe.servings,
    effort: recipe.effort,
    imageUrl: recipe.imageUrl,
    imageCredit: recipe.imageCredit,
    sourceName: recipe.sourceName,
    sourceUrl: recipe.sourceUrl,
    license: recipe.license,
    nutrition: recipe.nutrition ?? NO_NUTRITION,
    nutritionConfidence: recipe.nutritionConfidence,
    allergens: recipe.allergens,
    dietFlags: recipe.dietFlags,
    goalTags: recipe.goalTags,
    gentle: recipe.gentle,
    healthScore: recipe.healthScore,
    familyId: recipe.familyId,
    coreIngredientIds: 'coreIngredientIds' in recipe ? recipe.coreIngredientIds : NO_INGREDIENTS,
  };
}

/**
 * The core ingredients of a recipe whose lines are already loaded (the recipe screen), by the same
 * rule the candidate query applies in SQL: matched, not optional, and not a pantry staple. An
 * ingredient missing from `ingredients` is counted, exactly as SQL counts an id it cannot look up.
 */
export function coreIngredientIdsOf(
  lines: readonly Pick<RecipeIngredientLine, 'ingredientId' | 'optional'>[],
  ingredients: ReadonlyMap<string, Pick<Ingredient, 'pantryStaple'>>,
): string[] {
  const core = new Set<string>();
  for (const line of lines) {
    if (!line.ingredientId || line.optional) continue;
    if (ingredients.get(line.ingredientId)?.pantryStaple) continue;
    core.add(line.ingredientId);
  }
  return [...core];
}
