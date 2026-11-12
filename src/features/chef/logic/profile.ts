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

export function chefProfileFrom(prefs: Preferences): ChefProfileSummary {
  const minutes = prefs.maxMinutes;
  // Diets count as answered exactly when allergens are; until then both are unknown, not "none".
  const safety = toSafetyPrefs(prefs);
  const answered = safety.allergens !== null && safety.diets !== null;
  return {
    cuisines: prefs.cuisines.slice(0, MAX_CUISINES),
    // Stray lists from before the questions were answered are not trusted. The candidate list is
    // empty while unanswered too (nothing passes the safety filter), so Chef cannot recommend a
    // catalog recipe until the person answers.
    diet: answered ? [...safety.diets] : [],
    allergens: answered ? [...safety.allergens] : [],
    goals: [...prefs.goals],
    time_budget_minutes:
      minutes == null ? null : Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(minutes))),
    small_appetite: prefs.smallAppetite,
    // Only the unanswered case is spelled out: a missing flag already means answered.
    ...(answered ? {} : { allergens_answered: false }),
  };
}
