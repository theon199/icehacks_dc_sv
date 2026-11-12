/**
 * Bridges between the shapes the stores and catalog queries return and the shapes the domain
 * functions expect. The recipe screens read stores and the catalog, then hand domain code exactly
 * what it asks for, so every conversion lives here and is tested once.
 *
 * Safety-relevant conversions are conservative: allergen and diet answers only count as given when
 * the person has actually answered, and an unrecognised region never becomes a crash or a label
 * that reads "undefined".
 */
import {
  isRegionId,
  type FeedbackEvent as DomainFeedbackEvent,
  type Goal,
  type GoalTag,
  type RecipeSummary as DomainRecipe,
  type UserPreferences,
} from '@/domain';
import type { PersonalDetails as TargetDetails } from '@/domain/nutrition';
import type {
  Ingredient,
  RecipeDetail,
  RecipeNutrition,
  RecipeSummary as CatalogRecipe,
} from '@/lib/catalog';
import type {
  FeedbackEvent as StoredFeedbackEvent,
  HealthGoal,
  PersonalDetails as StoredDetails,
  Preferences,
  Units,
} from '@/stores';

const GOAL_FROM_STORE: Readonly<Record<HealthGoal, Goal>> = {
  more_protein: 'more_protein',
  more_fiber: 'more_fiber',
  lower_sodium: 'lower_sodium',
  heart_friendly: 'heart_friendly',
  lighter_meals: 'lighter_meals',
  plant_forward: 'plant_forward',
  steadier_energy: 'steady_energy',
};

export function toDomainGoals(goals: readonly HealthGoal[]): Goal[] {
  return [...new Set(goals.map((goal) => GOAL_FROM_STORE[goal]))];
}

/**
 * Preferences as the domain reads them. Allergens count as answered only once the person has
 * answered that question (an explicit "none" included); diets are answered alongside, because
 * onboarding asks about diets first. Before that both stay `null`, so nothing reads as safe.
 */
export function toDomainPreferences(prefs: Preferences, units: Units): UserPreferences {
  const answered = prefs.allergensAnswered;
  return {
    cuisines: prefs.cuisines,
    diets: answered ? prefs.diets : null,
    allergens: answered ? prefs.allergens : null,
    goals: toDomainGoals(prefs.goals),
    timeBudgetMinutes: prefs.maxMinutes,
    // No stated effort means any effort is fine.
    effort: prefs.effort ?? 3,
    householdSize: prefs.householdSize,
    smallAppetite: prefs.smallAppetite,
    units,
  };
}

const EMPTY_NUTRITION: RecipeNutrition = {
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

/**
 * Distinct ingredient ids that say something about the dish: matched, not optional and, when the
 * ingredient is known, not a pantry staple such as salt or oil.
 */
export function coreIngredientIds(
  lines: RecipeDetail['ingredients'],
  ingredients: ReadonlyMap<string, Pick<Ingredient, 'pantryStaple'>>,
): string[] {
  const out = new Set<string>();
  for (const line of lines) {
    if (!line.ingredientId || line.optional) continue;
    if (ingredients.get(line.ingredientId)?.pantryStaple) continue;
    out.add(line.ingredientId);
  }
  return [...out];
}

/** A catalog recipe in the domain's shape. */
export function toDomainRecipe(recipe: CatalogRecipe, core: readonly string[]): DomainRecipe {
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
    coreIngredientIds: core,
  };
}

/** Stored feedback as ranking reads it; events the domain has no use for are dropped. */
export function toDomainFeedback(events: readonly StoredFeedbackEvent[]): DomainFeedbackEvent[] {
  const out: DomainFeedbackEvent[] = [];
  for (const event of events) {
    if (event.kind === 'unsave') continue;
    const at = Date.parse(event.at);
    if (!Number.isFinite(at)) continue;
    const reasons = event.kind === 'not_for_me' && event.reason ? [event.reason] : [];
    const base = { recipeId: event.recipeId, kind: event.kind, at, reasons };
    out.push(
      event.ingredientId && reasons.includes('dislike_ingredient')
        ? { ...base, ingredientId: event.ingredientId }
        : base,
    );
  }
  return out;
}

/** Goal tags that move daily targets (protein up, sodium limit down). */
export function targetGoalTags(goals: readonly Goal[]): GoalTag[] {
  const tags: GoalTag[] = [];
  if (goals.includes('more_protein')) tags.push('high_protein');
  if (goals.includes('lower_sodium')) tags.push('lower_sodium');
  return tags;
}

/** Stored personal details plus age, as the daily-target calculator reads them. */
export function toTargetDetails(details: StoredDetails, age: number | null): TargetDetails {
  return {
    age,
    heightCm: details.heightCm,
    weightKg: details.weightKg,
    sex: details.sex === 'male' || details.sex === 'female' ? details.sex : null,
    activity: details.activity,
  };
}
