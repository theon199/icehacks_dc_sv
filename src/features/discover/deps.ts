/**
 * Everything Discover needs from outside its folder, in one place.
 *
 * - Store documents and catalog rows are reshaped into the recommendation engine's types. The
 *   stores and the engine were designed separately, so a few names and encodings differ (goal ids,
 *   ISO timestamps, one reason per stored event); the mapping lives here rather than in either side.
 * - Sibling features (Health's day context, the notification bell) are reached only from here, so
 *   the rest of the folder depends on one seam rather than on their internals.
 */
import {
  DEFAULT_PREFERENCES,
  isRegionId,
  type FeedbackEvent,
  type Goal,
  type Nutrition,
  type RecipeSummary,
  type UserPreferences,
} from '@/domain';
import { useDayContext } from '@/features/health';
import type { RecipeCandidate } from '@/lib/catalog';
import type {
  FeedbackEvent as StoredFeedbackEvent,
  HealthGoal,
  Preferences,
  Units,
} from '@/stores';

// --- Preferences -------------------------------------------------------------------------------

const GOAL_FOR: Readonly<Record<HealthGoal, Goal>> = {
  more_protein: 'more_protein',
  more_fiber: 'more_fiber',
  lower_sodium: 'lower_sodium',
  heart_friendly: 'heart_friendly',
  lighter_meals: 'lighter_meals',
  plant_forward: 'plant_forward',
  steadier_energy: 'steady_energy',
};

/** Effort the person is happy with when they said "any". */
const ANY_EFFORT = 3;

/**
 * Preferences as the ranking engine reads them. Until the allergen question is answered both
 * safety answers stay `null`, which the engine treats as "show nothing": an unanswered profile must
 * never look like one with no allergies.
 */
export function toRankPreferences(prefs: Preferences, units: Units = 'us'): UserPreferences {
  const answered = prefs.allergensAnswered;
  return {
    ...DEFAULT_PREFERENCES,
    cuisines: prefs.cuisines,
    diets: answered ? prefs.diets : null,
    allergens: answered ? prefs.allergens : null,
    goals: [...new Set(prefs.goals.map((goal) => GOAL_FOR[goal]))],
    timeBudgetMinutes: prefs.maxMinutes,
    effort: prefs.effort ?? ANY_EFFORT,
    householdSize: prefs.householdSize,
    smallAppetite: prefs.smallAppetite,
    units,
  };
}

// --- Feedback ----------------------------------------------------------------------------------

/**
 * Stored events → engine events, oldest first. An `unsave` cancels the latest earlier `save` of the
 * same recipe (the engine has no "unsave"), and events with unreadable timestamps are skipped.
 */
export function toRankFeedback(events: readonly StoredFeedbackEvent[]): FeedbackEvent[] {
  const out: (FeedbackEvent | null)[] = [];
  const lastSave = new Map<string, number>();
  for (const event of events) {
    const at = Date.parse(event.at);
    if (!Number.isFinite(at)) continue;
    if (event.kind === 'unsave') {
      const index = lastSave.get(event.recipeId);
      if (index !== undefined) {
        out[index] = null;
        lastSave.delete(event.recipeId);
      }
      continue;
    }
    if (event.kind === 'save') lastSave.set(event.recipeId, out.length);
    if (event.kind !== 'not_for_me') {
      out.push({ recipeId: event.recipeId, kind: event.kind, at, reasons: [] });
      continue;
    }
    const reasons = event.reason ? [event.reason] : [];
    out.push(
      event.reason === 'dislike_ingredient' && event.ingredientId
        ? {
            recipeId: event.recipeId,
            kind: 'not_for_me',
            at,
            reasons,
            ingredientId: event.ingredientId,
          }
        : { recipeId: event.recipeId, kind: 'not_for_me', at, reasons },
    );
  }
  return out.filter((event): event is FeedbackEvent => event !== null);
}

// --- Catalog -----------------------------------------------------------------------------------

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
 * A catalog candidate as the engine's recipe summary. Regions this build does not list fall back to
 * `global`, missing nutrition becomes all-unknown, and the matched ingredient ids stand in for the
 * engine's core ingredients.
 */
export function toRankRecipe(candidate: RecipeCandidate): RecipeSummary {
  return {
    id: candidate.id,
    slug: candidate.slug,
    title: candidate.title,
    summary: candidate.summary,
    cuisine: candidate.cuisine,
    region: isRegionId(candidate.region) ? candidate.region : 'global',
    course: candidate.course,
    totalMinutes: candidate.totalMinutes,
    activeMinutes: candidate.activeMinutes,
    servings: candidate.servings,
    effort: candidate.effort,
    imageUrl: candidate.imageUrl,
    imageCredit: candidate.imageCredit,
    sourceName: candidate.sourceName,
    sourceUrl: candidate.sourceUrl,
    license: candidate.license,
    nutrition: candidate.nutrition ?? NO_NUTRITION,
    nutritionConfidence: candidate.nutritionConfidence,
    allergens: candidate.allergens,
    dietFlags: candidate.dietFlags,
    goalTags: candidate.goalTags,
    gentle: candidate.gentle,
    healthScore: candidate.healthScore,
    familyId: candidate.familyId,
    coreIngredientIds: [...new Set(candidate.ingredientIds)],
  };
}

// --- Day context (Health) ----------------------------------------------------------------------

/** How strongly today's activity and sleep should tilt picks; each 0..1, 0 meaning as usual. */
export interface DayHints {
  readonly protein: number;
  readonly lighter: number;
}

export const NO_DAY_HINTS: DayHints = Object.freeze({ protein: 0, lighter: 0 });

/** Today's ranking hints from Apple Health; neutral when Health is off or its signals expired. */
export function useDayHints(): DayHints {
  return useDayContext().hints;
}

/** Local hour from which "lighter dinner" hints apply. */
export const DINNER_FROM_HOUR = 15;

/**
 * Folds day hints into the preferences used for ranking: an active day adds the protein goal, and
 * a short night adds the lighter-meals goal from mid-afternoon, when the next meal is dinner.
 */
export function withDayHints(
  prefs: UserPreferences,
  hints: DayHints,
  hour: number,
): UserPreferences {
  const extra: Goal[] = [];
  if (hints.protein > 0) extra.push('more_protein');
  if (hints.lighter > 0 && hour >= DINNER_FROM_HOUR) extra.push('lighter_meals');
  const missing = extra.filter((goal) => !prefs.goals.includes(goal));
  return missing.length === 0 ? prefs : { ...prefs, goals: [...prefs.goals, ...missing] };
}

/** One line for the deck header explaining a day-context tilt, or null when there is none. */
export function dayHintNote(hints: DayHints, hour: number): string | null {
  const protein = hints.protein > 0;
  const lighter = hints.lighter > 0 && hour >= DINNER_FROM_HOUR;
  if (protein && lighter) return 'Active day, short night: more protein, lighter dinners';
  if (protein) return 'Active day: leaning towards more protein';
  if (lighter) return 'Short night: leaning towards a lighter dinner';
  return null;
}

// --- Notifications -----------------------------------------------------------------------------

/** The header bell with its unread badge. */
export { NotificationBell } from '@/features/notifications';
