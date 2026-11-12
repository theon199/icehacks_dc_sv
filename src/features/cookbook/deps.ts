/**
 * The Cookbook's single adapter to code it does not own.
 *
 * Two kinds of things live here:
 * - shape bridges between the persisted user stores / catalog rows and the pure planner and
 *   recommender domain, which grew separate vocabularies (`steadier_energy` vs `steady_energy`,
 *   camelCase vs column-named nutrition, string timestamps vs epoch milliseconds);
 * - neutral stand-ins for sibling features that are not on `main` yet, so screens can mount them
 *   today and pick up the real thing by changing this file only.
 *
 * Everything in this file is pure apart from the two hooks at the bottom.
 */
import type { NutritionFacts, PersonalDetails as DomainPersonalDetails } from '@/domain/nutrition';
import {
  isRegionId,
  type FeedbackEvent as DomainFeedbackEvent,
  type Goal,
  type Nutrition,
  type RecipeSummary as DomainRecipeSummary,
  type UserPreferences,
} from '@/domain/types';
import { selectAge, useSessionStore } from '@/features/auth';
import type { RecipeCandidate, RecipeNutrition, RecipeSummary } from '@/lib/catalog';
import type { FeedbackEvent, HealthGoal, PantryItem, PersonalDetails, Preferences } from '@/stores';

const GOAL_IDS: Readonly<Record<HealthGoal, Goal>> = {
  more_protein: 'more_protein',
  more_fiber: 'more_fiber',
  lower_sodium: 'lower_sodium',
  heart_friendly: 'heart_friendly',
  lighter_meals: 'lighter_meals',
  plant_forward: 'plant_forward',
  steadier_energy: 'steady_energy',
};

/** Recipe goal tags that serve each stored goal; used for the planner's goal bonus. */
const GOAL_TAGS: Readonly<Record<HealthGoal, readonly string[]>> = {
  more_protein: ['high_protein'],
  more_fiber: ['high_fiber'],
  lower_sodium: ['lower_sodium'],
  heart_friendly: ['heart_friendly', 'lower_sat_fat'],
  lighter_meals: ['lower_calorie'],
  plant_forward: ['plant_forward'],
  steadier_energy: ['high_fiber', 'high_protein'],
};

/** Nutrient-target goal tags understood by `dailyTargets`. */
const TARGET_GOALS: Readonly<Partial<Record<HealthGoal, string>>> = {
  more_protein: 'high_protein',
  lower_sodium: 'lower_sodium',
};

/**
 * Stored preferences as the recommender reads them. Safety answers stay fail-closed: allergens
 * the person has not answered, and diets before onboarding finished, become `null`, which the
 * domain treats as "nothing is known to be safe yet".
 */
export function toDomainPreferences(prefs: Preferences): UserPreferences {
  const onboarded = prefs.onboardedAt != null;
  return {
    cuisines: prefs.cuisines,
    diets: onboarded || prefs.diets.length > 0 ? prefs.diets : null,
    allergens: prefs.allergensAnswered ? prefs.allergens : null,
    goals: prefs.goals.map((g) => GOAL_IDS[g]),
    timeBudgetMinutes: prefs.maxMinutes,
    effort: prefs.effort ?? 3,
    householdSize: prefs.householdSize,
    smallAppetite: prefs.smallAppetite,
    units: 'us',
  };
}

/** Recipe goal tags that count toward the person's goals. */
export function goalTagsFor(goals: readonly HealthGoal[]): string[] {
  return [...new Set(goals.flatMap((g) => GOAL_TAGS[g]))];
}

/** Goal ids `dailyTargets` adjusts for. */
export function targetGoalsFor(goals: readonly HealthGoal[]): string[] {
  return goals.flatMap((g) => {
    const tag = TARGET_GOALS[g];
    return tag ? [tag] : [];
  });
}

const EMPTY_NUTRITION: Nutrition = {
  kcal: null,
  proteinG: null,
  carbsG: null,
  fatG: null,
  satFatG: null,
  fiberG: null,
  sugarG: null,
  addedSugarG: null,
  sodiumMg: null,
};

/** Catalog summary (or candidate) in the recommender's shape. */
export function toDomainRecipe(recipe: RecipeSummary | RecipeCandidate): DomainRecipeSummary {
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
    nutrition: recipe.nutrition ?? EMPTY_NUTRITION,
    nutritionConfidence: recipe.nutritionConfidence,
    allergens: recipe.allergens,
    dietFlags: recipe.dietFlags,
    goalTags: recipe.goalTags,
    gentle: recipe.gentle,
    healthScore: recipe.healthScore,
    familyId: recipe.familyId,
    // Catalog candidates list every matched ingredient, staples included.
    coreIngredientIds: 'ingredientIds' in recipe ? recipe.ingredientIds : [],
  };
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

/** Stored feedback as the ranking domain reads it; kinds it does not know are left out. */
export function toDomainFeedback(events: readonly FeedbackEvent[]): DomainFeedbackEvent[] {
  const out: DomainFeedbackEvent[] = [];
  for (const e of events) {
    if (e.kind === 'unsave') continue;
    const at = Date.parse(e.at);
    if (!Number.isFinite(at)) continue;
    out.push({
      recipeId: e.recipeId,
      kind: e.kind,
      at,
      reasons: e.reason ? [e.reason] : [],
      ...(e.ingredientId ? { ingredientId: e.ingredientId } : {}),
    });
  }
  return out;
}

/** The signed-in person's age, for age-dependent nutrient limits. */
export function usePersonAge(): number | null {
  return useSessionStore((state) => selectAge(state));
}

/**
 * Estimated grocery cost for a set of planned recipes. The grocery feature owns cost estimates;
 * until it publishes a summary component this renders nothing.
 */
export function WeekCostSummary(_props: { recipeIds: readonly string[] }): null {
  return null;
}
