/**
 * The one translation from the synced user documents in this folder to the pure domain types in
 * `src/domain`. The documents are a sync contract and keep their stored vocabulary; the domain keeps
 * its own. Every feature reads the stores through these functions, so a rule here (when safety
 * answers count, how an unsave is read, what "any effort" means) holds the same everywhere.
 *
 * Kept out of the stores barrel on purpose: import it as `@/stores/domainBridge`.
 *
 * Safety is fail-closed in every direction. Until the person has answered the allergen question
 * (an explicit "none" counts), both allergens and diets read as `null`, which the domain's safety
 * filter treats as "nothing is known to be safe yet", never as "no restrictions".
 */
import { DEFAULT_PREFERENCES, userPreferencesSchema, type UserPreferences } from '@/domain';
import type { SafetyPrefs } from '@/domain/safety';
import { cuisineIdSchema } from '@/domain/types/cuisines';
import type { FeedbackEvent as DomainFeedbackEvent } from '@/domain/types/feedback';
import type { Goal } from '@/domain/types/goals';

import type { FeedbackEvent as StoredFeedbackEvent } from './feedback';
import type { HealthGoal, Preferences } from './preferences';
import type { Units } from './settings';

// --- Goals -------------------------------------------------------------------------------------

/**
 * Stored goal id → domain goal id. They match except for one name the stored documents keep for
 * compatibility with data already synced (`steadier_energy`).
 */
export const GOAL_TO_DOMAIN: Readonly<Record<HealthGoal, Goal>> = Object.freeze({
  more_protein: 'more_protein',
  more_fiber: 'more_fiber',
  lower_sodium: 'lower_sodium',
  heart_friendly: 'heart_friendly',
  lighter_meals: 'lighter_meals',
  plant_forward: 'plant_forward',
  steadier_energy: 'steady_energy',
});

const GOAL_TO_STORED = Object.freeze(
  Object.fromEntries(
    Object.entries(GOAL_TO_DOMAIN).map(([stored, domain]) => [domain, stored]),
  ) as Record<Goal, HealthGoal>,
);

export function toDomainGoal(goal: HealthGoal): Goal {
  return GOAL_TO_DOMAIN[goal];
}

export function toStoredGoal(goal: Goal): HealthGoal {
  return GOAL_TO_STORED[goal];
}

/** Stored goals as domain goals, once each, in the person's order. */
export function toDomainGoals(goals: readonly HealthGoal[]): Goal[] {
  return [...new Set(goals.map(toDomainGoal))];
}

// --- Preferences -------------------------------------------------------------------------------

/** The safety answers a preferences document holds. */
export type StoredSafetyAnswers = Pick<Preferences, 'allergens' | 'diets' | 'allergensAnswered'>;

/**
 * Allergen and diet answers as the safety filter reads them. Diets are asked alongside allergens,
 * so both count as answered exactly when the allergen question is; before that both are `null`.
 */
export function toSafetyPrefs(prefs: StoredSafetyAnswers): SafetyPrefs {
  if (!prefs.allergensAnswered) return { allergens: null, diets: null };
  return { allergens: prefs.allergens, diets: prefs.diets };
}

/** Effort the person is happy with when they did not pick one: anything goes. */
const ANY_EFFORT = 3;

/**
 * Full ranking preferences from the stored document. The result is validated against the domain
 * schema; a document that does not fit (for example a vocabulary from a newer build) falls back to
 * `DEFAULT_PREFERENCES`, whose safety answers are unanswered, so nothing is shown as safe.
 */
export function toUserPreferences(prefs: Preferences, units: Units): UserPreferences {
  const safety = toSafetyPrefs(prefs);
  const parsed = userPreferencesSchema.safeParse({
    // A cuisine id this build cannot read is dropped rather than discarding every other answer.
    cuisines: prefs.cuisines.filter((id) => cuisineIdSchema.safeParse(id).success),
    diets: safety.diets,
    allergens: safety.allergens,
    goals: toDomainGoals(prefs.goals),
    timeBudgetMinutes: prefs.maxMinutes,
    effort: prefs.effort ?? ANY_EFFORT,
    householdSize: prefs.householdSize,
    smallAppetite: prefs.smallAppetite,
    units,
  });
  return parsed.success ? parsed.data : DEFAULT_PREFERENCES;
}

// --- Feedback ----------------------------------------------------------------------------------

/**
 * Stored feedback as the ranking domain reads it, oldest first.
 *
 * - The domain has no "unsave": an `unsave` withdraws the latest earlier `save` of the same recipe
 *   and is not itself passed on. Saves before that one are never touched, so a second unsave with
 *   no save in between changes nothing.
 * - Timestamps are ISO strings in storage and epoch milliseconds in the domain; an event whose time
 *   cannot be read is skipped.
 * - A stored reason becomes the one-item reasons list of a `not_for_me`; other kinds carry none. The
 *   disliked ingredient travels only with a `dislike_ingredient` reason.
 */
export function toDomainFeedback(events: readonly StoredFeedbackEvent[]): DomainFeedbackEvent[] {
  const kept: (DomainFeedbackEvent | null)[] = [];
  // Position in `kept` of each recipe's latest save, until an unsave withdraws it.
  const latestSave = new Map<string, number>();
  for (const event of events) {
    const at = Date.parse(event.at);
    if (!Number.isFinite(at)) continue;
    if (event.kind === 'unsave') {
      const index = latestSave.get(event.recipeId);
      if (index !== undefined) {
        kept[index] = null;
        latestSave.delete(event.recipeId);
      }
      continue;
    }
    if (event.kind === 'save') latestSave.set(event.recipeId, kept.length);
    kept.push(toDomainEvent(event, event.kind, at));
  }
  return kept.filter((event): event is DomainFeedbackEvent => event !== null);
}

function toDomainEvent(
  event: StoredFeedbackEvent,
  kind: DomainFeedbackEvent['kind'],
  at: number,
): DomainFeedbackEvent {
  const base = { recipeId: event.recipeId, kind, at };
  if (kind !== 'not_for_me' || !event.reason) return { ...base, reasons: [] };
  const reasons = [event.reason];
  return event.reason === 'dislike_ingredient' && event.ingredientId
    ? { ...base, reasons, ingredientId: event.ingredientId }
    : { ...base, reasons };
}
