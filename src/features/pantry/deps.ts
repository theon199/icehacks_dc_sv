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
import { selectCanUseAi, selectIsAdult, useSessionStore } from '@/features/auth';
import type { RecipeCandidate } from '@/lib/catalog';
import { MAX_PANTRY_ITEMS, usePantryStore, type PantryItem } from '@/stores/pantry';
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

/**
 * Whether the pantry can offer Snap. Its result screen is an AI feature, open only to adults who
 * agreed to the AI terms: an adult who has not agreed is asked first, and anyone younger is not
 * offered Snap at all.
 */
export type SnapAccess = 'open' | 'needsConsent' | 'unavailable';

export function useSnapAccess(): SnapAccess {
  return useSessionStore((state) => {
    if (!selectIsAdult(state)) return 'unavailable';
    return selectCanUseAi(state) ? 'open' : 'needsConsent';
  });
}

/**
 * Puts a just-removed item back exactly as it was, same id and added date, so undoing a removal
 * syncs as that item coming back rather than as a new one. The pantry store has no restore action,
 * so this writes the record directly; a full pantry or an id already in use leaves it unchanged.
 */
export function restorePantryItem(item: PantryItem): void {
  usePantryStore.setState((state) => {
    if (item.id in state.items || Object.keys(state.items).length >= MAX_PANTRY_ITEMS) return state;
    return { items: { ...state.items, [item.id]: item } };
  });
}
