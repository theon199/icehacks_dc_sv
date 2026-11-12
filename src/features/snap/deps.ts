/**
 * The one place Snap reaches into code owned by other areas. Everything here is a thin adapter so
 * that when a sibling module lands (or a shared shape changes) only this file moves.
 *
 * - `AiGate`: the 18+ and AI-consent gate. Snap is a tab root, which `Stack.Protected` cannot
 *   guard, so the screen renders this gate itself. Until Chef publishes its shared gate, Snap uses
 *   a local gate with the same contract built on the session store.
 * - Preference and recipe bridges: the user stores and the catalog use their own field names and
 *   vocabularies, while ranking and safety in `src/domain` expect the domain shapes. These
 *   functions translate one way only (store/catalog → domain) and fail closed.
 * - `logEstimatedMeal`: the cook log has no field for meals eaten out, so an estimate is recorded
 *   under a namespaced id with a readable note. See `ESTIMATED_MEAL_PREFIX`.
 */
import type { SafetyPrefs } from '@/domain/safety';
import { isRegionId } from '@/domain/types/cuisines';
import type { Goal } from '@/domain/types/goals';
import { DEFAULT_PREFERENCES, type UserPreferences } from '@/domain/types/preferences';
import type { Nutrition, RecipeSummary as DomainRecipe } from '@/domain/types/recipe';
import type { RecipeCandidate, RecipeSummary } from '@/lib/catalog';
import type { HealthGoal, Preferences, Units } from '@/stores';
import { useCookLogStore } from '@/stores';

export { SnapAiGate as AiGate } from './components/SnapAiGate';

// --- Preferences --------------------------------------------------------------------------------

const GOAL_FROM_STORE: Readonly<Record<HealthGoal, Goal>> = {
  more_protein: 'more_protein',
  more_fiber: 'more_fiber',
  lower_sodium: 'lower_sodium',
  heart_friendly: 'heart_friendly',
  lighter_meals: 'lighter_meals',
  plant_forward: 'plant_forward',
  steadier_energy: 'steady_energy',
};

/**
 * Allergen and diet answers in the shape the safety filter expects. Until the person has answered
 * the allergen question both are `null`, which the filter reads as "nothing is safe yet".
 */
export function toSafetyPrefs(prefs: Preferences): SafetyPrefs {
  if (!prefs.allergensAnswered) return { allergens: null, diets: null };
  return { allergens: [...prefs.allergens], diets: [...prefs.diets] };
}

/** Full ranking preferences from the stored answers. */
export function toUserPreferences(prefs: Preferences, units: Units): UserPreferences {
  const safety = toSafetyPrefs(prefs);
  return {
    ...DEFAULT_PREFERENCES,
    cuisines: [...prefs.cuisines],
    diets: safety.diets,
    allergens: safety.allergens,
    goals: prefs.goals.map((goal) => GOAL_FROM_STORE[goal]),
    timeBudgetMinutes: prefs.maxMinutes,
    // No stated effort means any effort is fine.
    effort: prefs.effort ?? 3,
    householdSize: prefs.householdSize,
    smallAppetite: prefs.smallAppetite,
    units,
  };
}

// --- Recipes -----------------------------------------------------------------------------------

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

/**
 * A catalog recipe in the domain shape. Core ingredients are the matched ingredient ids minus
 * pantry staples (salt, oil and the like), which is what pantry coverage counts.
 */
export function toDomainRecipe(
  recipe: RecipeSummary | RecipeCandidate,
  staples: ReadonlySet<string> = new Set(),
): DomainRecipe {
  const ingredientIds = 'ingredientIds' in recipe ? recipe.ingredientIds : [];
  const core = [...new Set(ingredientIds)].filter((id) => !staples.has(id));
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
    coreIngredientIds: core,
  };
}

// --- Cook log ----------------------------------------------------------------------------------

/**
 * Cook log ids for meals estimated from a photo start with this, so they can never be mistaken for
 * a catalog recipe the person cooked.
 */
export const ESTIMATED_MEAL_PREFIX = 'snap:';

export interface EstimatedMeal {
  dishName: string;
  /** Human-readable summary of the estimate, stored as the entry's note. */
  note: string;
}

/** `snap:chicken-tikka-masala`; falls back to `snap:dish` for names with no letters or digits. */
export function estimatedMealId(dishName: string): string {
  const slug = dishName
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return `${ESTIMATED_MEAL_PREFIX}${slug || 'dish'}`;
}

/** Records the meal in today's cook log. Returns the entry id, or null when it was rejected. */
export function logEstimatedMeal(meal: EstimatedMeal, at?: string): string | null {
  return useCookLogStore
    .getState()
    .log({ recipeId: estimatedMealId(meal.dishName), notes: meal.note.slice(0, 1000) }, at);
}
