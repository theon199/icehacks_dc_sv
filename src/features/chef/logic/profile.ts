/**
 * The short profile Chef receives with every question: enough to tailor an answer, nothing that
 * identifies the person (no name, no body measurements, no account details).
 */
import type { ChefProfileSummary } from '@/lib/api/ai';
import type { Preferences } from '@/stores';
import { toSafetyPrefs } from '@/stores/domainBridge';

const MAX_CUISINES = 10;
const MIN_MINUTES = 5;
const MAX_MINUTES = 600;

/**
 * Sent as the only diet entry while the allergen and diet questions are unanswered. The profile's
 * allergen list can only hold allergen ids, so an empty list there would read as "no allergens";
 * this entry tells Chef that nothing is known yet instead. Chef reads it as "allergens and diet
 * not answered yet".
 */
export const SAFETY_NOT_ANSWERED = 'allergens_and_diet_not_answered_yet';

export function chefProfileFrom(prefs: Preferences): ChefProfileSummary {
  const minutes = prefs.maxMinutes;
  // Diets count as answered exactly when allergens are; until then both are unknown, not "none".
  const safety = toSafetyPrefs(prefs);
  const answered = safety.allergens !== null && safety.diets !== null;
  return {
    cuisines: prefs.cuisines.slice(0, MAX_CUISINES),
    diet: answered ? [...safety.diets] : [SAFETY_NOT_ANSWERED],
    // The candidate list is empty while unanswered too (nothing passes the safety filter), so
    // Chef cannot recommend a catalog recipe until the person answers.
    allergens: answered ? [...safety.allergens] : [],
    goals: [...prefs.goals],
    time_budget_minutes:
      minutes == null ? null : Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(minutes))),
    small_appetite: prefs.smallAppetite,
  };
}
