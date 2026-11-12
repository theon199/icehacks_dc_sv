/**
 * Shape adapters between the stores and catalog this feature reads and the recommendation domain
 * it ranks with. The stored preferences and catalog rows predate the domain's types and differ in
 * a few names; every difference is bridged here so the rest of the feature uses each side as is.
 *
 * Safety is preserved in both directions: anything this file cannot map makes the person's
 * preferences "unanswered", which the domain's safety filter treats as "show nothing", never as
 * "no restrictions".
 */
import {
  DEFAULT_PREFERENCES,
  isRegionId,
  userPreferencesSchema,
  type Goal,
  type RecipeSummary,
  type UserPreferences,
} from '@/domain';
import type { RecipeCandidate } from '@/lib/catalog';
import type { HealthGoal, Preferences } from '@/stores/preferences';
import type { Units } from '@/stores/settings';

const GOALS: Readonly<Record<HealthGoal, Goal>> = {
  more_protein: 'more_protein',
  more_fiber: 'more_fiber',
  lower_sodium: 'lower_sodium',
  heart_friendly: 'heart_friendly',
  lighter_meals: 'lighter_meals',
  plant_forward: 'plant_forward',
  steadier_energy: 'steady_energy',
};

/**
 * Stored preferences as the ranking domain reads them. Allergens count as answered only once the
 * person answered that question; diets once onboarding finished (an untouched default list is not
 * an answer).
 */
export function toRankPreferences(prefs: Preferences, units: Units): UserPreferences {
  const parsed = userPreferencesSchema.safeParse({
    cuisines: prefs.cuisines,
    diets: prefs.onboardedAt != null ? prefs.diets : null,
    allergens: prefs.allergensAnswered ? prefs.allergens : null,
    goals: prefs.goals.map((goal) => GOALS[goal]),
    timeBudgetMinutes: prefs.maxMinutes,
    effort: prefs.effort ?? 3,
    householdSize: prefs.householdSize,
    smallAppetite: prefs.smallAppetite,
    units,
  });
  return parsed.success ? parsed.data : DEFAULT_PREFERENCES;
}

const NO_NUTRITION = {
  kcal: null,
  proteinG: null,
  carbsG: null,
  fatG: null,
  satFatG: null,
  fiberG: null,
  sugarG: null,
  addedSugarG: null,
  sodiumMg: null,
} as const;

/**
 * A catalog candidate as a domain recipe summary. The domain matches the pantry against "core"
 * ingredients, which leave out staples such as salt and oil, so `staples` lists the catalog's
 * pantry-staple ids.
 */
export function toRankRecipe(
  candidate: RecipeCandidate,
  staples: ReadonlySet<string>,
): RecipeSummary {
  const { ingredientIds, nutrition, region, ...rest } = candidate;
  return {
    ...rest,
    region: isRegionId(region) ? region : 'global',
    nutrition: nutrition ?? NO_NUTRITION,
    coreIngredientIds: [...new Set(ingredientIds)].filter((id) => !staples.has(id)),
  };
}
