/**
 * Discover modes and the coarse catalog filters behind each. SQL only narrows the pool (safety,
 * time, gentle tag, course); the engine still re-checks safety and decides what fits a mode.
 */
import { DEFAULT_RANKING_CONFIG, dietMask, type DeckMode, type UserPreferences } from '@/domain';
import type { CandidateFilters, Course } from '@/lib/catalog';

export interface ModeOption {
  readonly value: DeckMode;
  readonly label: string;
  /** Read by VoiceOver after the label. */
  readonly hint: string;
}

export const MODE_OPTIONS: readonly ModeOption[] = [
  { value: 'forYou', label: 'For you', hint: 'Recipes picked from everything you told us' },
  {
    value: 'quick',
    label: 'Quick',
    hint: `Ready in ${DEFAULT_RANKING_CONFIG.feed.quickMaxMinutes} minutes or less`,
  },
  { value: 'pantry', label: 'Use my pantry', hint: 'Dishes that use what you already have' },
  { value: 'gentle', label: 'Gentle', hint: 'Smaller, gentler meals for a small appetite' },
];

/** Gentle is only offered with small appetite mode on. */
export function availableModes(smallAppetite: boolean): readonly ModeOption[] {
  return smallAppetite ? MODE_OPTIONS : MODE_OPTIONS.filter((mode) => mode.value !== 'gentle');
}

/** A mode that is no longer offered falls back to For you. */
export function resolveMode(mode: DeckMode, smallAppetite: boolean): DeckMode {
  return mode === 'gentle' && !smallAppetite ? 'forYou' : mode;
}

/** Courses a deck normally draws from: proper meals, not drinks or sides. */
export const MEAL_COURSES: readonly Course[] = ['breakfast', 'main', 'soup', 'salad'];

export const CANDIDATE_LIMIT = 600;
export const WIDE_CANDIDATE_LIMIT = 1500;

/**
 * Catalog filters for a deck, or null when nothing may be shown yet because the allergen and diet
 * questions are unanswered (fail-closed: no query runs at all).
 */
export function candidateFilters(
  prefs: Pick<UserPreferences, 'allergens' | 'diets'>,
  mode: DeckMode,
  wide: boolean,
): CandidateFilters | null {
  if (prefs.allergens === null || prefs.diets === null) return null;
  const filters: CandidateFilters = {
    limit: wide ? WIDE_CANDIDATE_LIMIT : CANDIDATE_LIMIT,
  };
  const mask = dietMask(prefs.diets);
  if (mask > 0) filters.excludeDietMask = mask;
  if (prefs.allergens.length > 0) filters.avoidAllergens = [...prefs.allergens].sort();
  if (!wide) filters.course = MEAL_COURSES;
  if (mode === 'quick') filters.maxMinutes = DEFAULT_RANKING_CONFIG.feed.quickMaxMinutes;
  if (mode === 'gentle') filters.gentle = true;
  return filters;
}
