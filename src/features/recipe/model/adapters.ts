/**
 * Bridges between the shapes the stores and catalog queries return and the shapes the domain
 * functions expect. Preferences, goals, feedback and recipes go through the app-wide bridges
 * (`@/stores/domainBridge`, `@/lib/catalog`) and are re-exported here; only conversions specific
 * to the recipe screens live in this file.
 *
 * Safety-relevant conversions are conservative: allergen and diet answers only count as given when
 * the person has actually answered, and an unrecognised region never becomes a crash or a label
 * that reads "undefined".
 */
import type { Goal, GoalTag, RecipeSummary as DomainRecipe } from '@/domain';
import type { PersonalDetails as TargetDetails } from '@/domain/nutrition';
import {
  toDomainRecipe as toDomainSummary,
  type RecipeSummary as CatalogRecipe,
} from '@/lib/catalog';
import type { PersonalDetails as StoredDetails } from '@/stores';

export {
  toDomainFeedback,
  toDomainGoals,
  toUserPreferences as toDomainPreferences,
} from '@/stores/domainBridge';

/**
 * A catalog recipe in the domain's shape, with the core ingredients worked out for it. A recipe
 * detail carries its lines rather than core ids; `coreIngredientIdsOf` turns those lines into the
 * ids passed here.
 */
export function toDomainRecipe(recipe: CatalogRecipe, core: readonly string[]): DomainRecipe {
  return { ...toDomainSummary(recipe), coreIngredientIds: core };
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
