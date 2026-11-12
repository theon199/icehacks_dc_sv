/**
 * The short profile Chef receives with every question: enough to tailor an answer, nothing that
 * identifies the person (no name, no body measurements, no account details).
 */
import type { ChefProfileSummary } from '@/lib/api/ai';
import type { Preferences } from '@/stores';

const MAX_CUISINES = 10;
const MIN_MINUTES = 5;
const MAX_MINUTES = 600;

export function chefProfileFrom(prefs: Preferences): ChefProfileSummary {
  const minutes = prefs.maxMinutes;
  return {
    cuisines: prefs.cuisines.slice(0, MAX_CUISINES),
    diet: [...prefs.diets],
    // An unanswered allergen question sends an empty list; the candidate list is empty in that
    // case too (nothing passes the safety filter), so Chef cannot recommend a catalog recipe.
    allergens: prefs.allergensAnswered ? [...prefs.allergens] : [],
    goals: [...prefs.goals],
    time_budget_minutes:
      minutes == null ? null : Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(minutes))),
    small_appetite: prefs.smallAppetite,
  };
}
