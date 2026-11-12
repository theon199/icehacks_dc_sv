/**
 * Everything Discover needs from outside its folder, in one place.
 *
 * - Store documents and catalog rows reach the recommendation engine through the shared bridges
 *   (`@/stores/domainBridge` and `@/lib/catalog`), re-exported here under Discover's names.
 * - Sibling features (Health's day context, the notification bell) are reached only from here, so
 *   the rest of the folder depends on one seam rather than on their internals.
 */
import type { Goal, UserPreferences } from '@/domain';
import { useDayContext } from '@/features/health';
import type { Preferences, Units } from '@/stores';
import { toUserPreferences } from '@/stores/domainBridge';

// --- Preferences, feedback and recipes ---------------------------------------------------------

/** Ranking preferences from the stored answers; see `toUserPreferences`. */
export function toRankPreferences(prefs: Preferences, units: Units = 'us'): UserPreferences {
  return toUserPreferences(prefs, units);
}

export { toDomainFeedback as toRankFeedback } from '@/stores/domainBridge';
export { toDomainRecipe as toRankRecipe } from '@/lib/catalog';

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
 * Which day-context tilts apply right now, as plain flags. Health hands out a fresh hints object
 * whenever its clock moves (every foreground, for one), so anything keyed on the deck must follow
 * these values rather than the object, or the deck would restart without anything having changed.
 */
export interface DayTilt {
  /** An active day: lean towards protein. */
  readonly protein: boolean;
  /** A short night, and dinner is the next meal: lean towards lighter dishes. */
  readonly lighter: boolean;
}

export const NO_DAY_TILT: DayTilt = Object.freeze({ protein: false, lighter: false });

export function dayTiltFor(hints: DayHints, hour: number): DayTilt {
  const protein = hints.protein > 0;
  const lighter = hints.lighter > 0 && hour >= DINNER_FROM_HOUR;
  if (!protein && !lighter) return NO_DAY_TILT;
  return { protein, lighter };
}

/** Folds a day tilt into the preferences used for ranking, as extra goals. */
export function withDayTilt(prefs: UserPreferences, tilt: DayTilt): UserPreferences {
  const extra: Goal[] = [];
  if (tilt.protein) extra.push('more_protein');
  if (tilt.lighter) extra.push('lighter_meals');
  const missing = extra.filter((goal) => !prefs.goals.includes(goal));
  return missing.length === 0 ? prefs : { ...prefs, goals: [...prefs.goals, ...missing] };
}

/** One line for the deck header explaining a day tilt, or null when there is none. */
export function dayTiltNote(tilt: DayTilt): string | null {
  if (tilt.protein && tilt.lighter) return 'Active day, short night: more protein, lighter dinners';
  if (tilt.protein) return 'Active day: leaning towards more protein';
  if (tilt.lighter) return 'Short night: leaning towards a lighter dinner';
  return null;
}

// --- Notifications -----------------------------------------------------------------------------

/** The header bell with its unread badge. */
export { NotificationBell } from '@/features/notifications';
