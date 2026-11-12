/**
 * The Cookbook's single adapter to code it does not own.
 *
 * Two kinds of things live here:
 * - shape bridges between the persisted user stores / catalog rows and the pure planner and
 *   recommender domain. Preferences, feedback and recipes go through the app-wide bridges
 *   (`@/stores/domainBridge`, `@/lib/catalog`); only the planner-specific shapes (nutrition keys,
 *   personal details, goal tags for the planner's bonus) are built here;
 * - sibling features' public surfaces the Cookbook mounts (grocery's cost estimate).
 *
 * Everything in this file is pure apart from the two hooks at the bottom.
 */
import type { NutritionFacts, PersonalDetails as DomainPersonalDetails } from '@/domain/nutrition';
import { GOAL_DETAILS, type Goal, type UserPreferences } from '@/domain/types';
import { selectAge, useSessionStore } from '@/features/auth';
import type { RecipeNutrition } from '@/lib/catalog';
import type { HealthGoal, PantryItem, PersonalDetails, Preferences, Units } from '@/stores';
import { toDomainGoal, toUserPreferences } from '@/stores/domainBridge';

export { toDomainFeedback } from '@/stores/domainBridge';
export { toDomainRecipe } from '@/lib/catalog';

/** Nutrient-target goal tags understood by `dailyTargets`, per domain goal. */
const TARGET_GOALS: Readonly<Partial<Record<Goal, string>>> = {
  more_protein: 'high_protein',
  lower_sodium: 'lower_sodium',
};

/** Stored preferences as the recommender reads them; see `toUserPreferences`. */
export function toDomainPreferences(prefs: Preferences, units: Units = 'us'): UserPreferences {
  return toUserPreferences(prefs, units);
}

/** Recipe goal tags that count toward the person's goals (the planner's goal bonus). */
export function goalTagsFor(goals: readonly HealthGoal[]): string[] {
  return [...new Set(goals.flatMap((goal) => GOAL_DETAILS[toDomainGoal(goal)].servedBy))];
}

/** Goal ids `dailyTargets` adjusts for. */
export function targetGoalsFor(goals: readonly HealthGoal[]): string[] {
  return goals.flatMap((goal) => {
    const tag = TARGET_GOALS[toDomainGoal(goal)];
    return tag ? [tag] : [];
  });
}

/** Catalog per-serving nutrition keyed the way the nutrition domain expects. */
export function toNutritionFacts(n: RecipeNutrition | null): NutritionFacts {
  if (!n) return {};
  return {
    kcal: n.kcal,
    protein_g: n.proteinG,
    carbs_g: n.carbsG,
    fat_g: n.fatG,
    sat_fat_g: n.satFatG,
    fiber_g: n.fiberG,
    sugar_g: n.sugarG,
    added_sugar_g: n.addedSugarG,
    sodium_mg: n.sodiumMg,
  };
}

export function toDomainPersonalDetails(
  details: PersonalDetails,
  age: number | null,
): DomainPersonalDetails {
  return {
    age,
    sex: details.sex === 'unspecified' ? null : details.sex,
    heightCm: details.heightCm,
    weightKg: details.weightKg,
    activity: details.activity,
  };
}

/** Catalog ingredient ids on hand; free-text pantry items cannot be matched and are skipped. */
export function toPantryIds(items: Readonly<Record<string, PantryItem>>): string[] {
  const ids = new Set<string>();
  for (const item of Object.values(items)) if (item.ingredientId) ids.add(item.ingredientId);
  return [...ids];
}

/** The signed-in person's age, for age-dependent nutrient limits. */
export function usePersonAge(): number | null {
  return useSessionStore((state) => selectAge(state));
}

/**
 * Estimated grocery cost; the planner passes its week as `recipes` (each with the servings it
 * feeds) so the whole week is costed as one shopping trip.
 */
export { CostSummary } from '@/features/grocery';
