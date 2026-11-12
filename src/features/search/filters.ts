/**
 * Search filters as the person picks them in the filter sheet, and their translation into the
 * catalog's `SearchFilters` query arguments.
 *
 * The person's own allergens and diets are deliberately not turned into query arguments here:
 * search shows every match and marks the ones that do not fit them (see `resultItems.ts`), so a
 * recipe never disappears without explanation. A diet picked in this sheet is an explicit request
 * and does narrow the query.
 */
import {
  COURSES,
  dietMask,
  GOAL_TAGS,
  type Course,
  type DietId,
  type GoalTag,
  type SearchFilters,
} from '@/lib/catalog';

export interface SearchFilterState {
  readonly cuisines: readonly string[];
  readonly courses: readonly Course[];
  /** Upper bound on total cooking time in minutes; null for any. */
  readonly maxMinutes: number | null;
  readonly diets: readonly DietId[];
  readonly goals: readonly GoalTag[];
  /** Upper bound on calories per serving; null for any. */
  readonly maxKcal: number | null;
}

const NOTHING_PICKED: readonly never[] = Object.freeze([]);

export const EMPTY_FILTERS: SearchFilterState = Object.freeze({
  cuisines: NOTHING_PICKED,
  courses: NOTHING_PICKED,
  maxMinutes: null,
  diets: NOTHING_PICKED,
  goals: NOTHING_PICKED,
  maxKcal: null,
});

/** Time limits offered in the sheet, in minutes. */
export const TIME_CHOICES = [15, 30, 45, 60] as const;

/** Calorie ceilings offered in the sheet, per serving. */
export const KCAL_CHOICES = [300, 450, 600, 800] as const;

export const COURSE_LABELS: Readonly<Record<Course, string>> = {
  breakfast: 'Breakfast',
  main: 'Main',
  side: 'Side',
  soup: 'Soup',
  salad: 'Salad',
  snack: 'Snack',
  dessert: 'Dessert',
  drink: 'Drink',
};

/** How each catalog goal tag reads as a filter. */
export const GOAL_TAG_LABELS: Readonly<Record<GoalTag, string>> = {
  high_protein: 'High protein',
  high_fiber: 'High fiber',
  lower_sodium: 'Lower sodium',
  lower_sat_fat: 'Lower saturated fat',
  lower_calorie: 'Lower calorie',
  plant_forward: 'Plant-forward',
  heart_friendly: 'Heart-friendly',
};

export const ALL_COURSES: readonly Course[] = COURSES;
export const ALL_GOAL_TAGS: readonly GoalTag[] = GOAL_TAGS;

/** Sorted copy, so equal selections produce equal query arguments (and share a cache entry). */
function sorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort();
}

/**
 * Query arguments for `useRecipeSearch`. Only set fields are included: an empty selection means
 * "any", never "none".
 */
export function toSearchFilters(state: SearchFilterState): SearchFilters {
  const out: SearchFilters = {};
  if (state.cuisines.length > 0) out.cuisines = sorted(state.cuisines);
  const [onlyCourse, ...moreCourses] = state.courses;
  if (onlyCourse !== undefined) {
    out.course = moreCourses.length === 0 ? onlyCourse : sorted(state.courses);
  }
  if (state.maxMinutes != null) out.maxMinutes = state.maxMinutes;
  const mask = dietMask(state.diets);
  if (mask !== 0) out.dietMask = mask;
  if (state.goals.length > 0) out.goals = sorted(state.goals);
  if (state.maxKcal != null) out.maxKcal = state.maxKcal;
  return out;
}

/**
 * Number of individual filter values in use (each cuisine, course, diet and goal counts, plus one
 * each for a time or calorie limit), for the badge on the Filters button.
 */
export function activeFilterCount(state: SearchFilterState): number {
  return (
    state.cuisines.length +
    state.courses.length +
    state.diets.length +
    state.goals.length +
    (state.maxMinutes != null ? 1 : 0) +
    (state.maxKcal != null ? 1 : 0)
  );
}

export function hasActiveFilters(state: SearchFilterState): boolean {
  return activeFilterCount(state) > 0;
}

/** Adds the value when absent, removes it when present. */
export function toggleValue<T>(values: readonly T[], value: T): readonly T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

/** One removable chip under the search field. */
export interface ActiveFilterChip {
  readonly key: string;
  readonly label: string;
  /** The state with just this filter removed. */
  readonly remove: (state: SearchFilterState) => SearchFilterState;
}

/** Chips describing the active filters, in sheet order. `labelCuisine` formats cuisine ids. */
export function activeFilterChips(
  state: SearchFilterState,
  labelCuisine: (id: string) => string,
  labelDiet: (id: DietId) => string,
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  for (const cuisine of state.cuisines) {
    chips.push({
      key: `cuisine:${cuisine}`,
      label: labelCuisine(cuisine),
      remove: (s) => ({ ...s, cuisines: s.cuisines.filter((c) => c !== cuisine) }),
    });
  }
  for (const course of state.courses) {
    chips.push({
      key: `course:${course}`,
      label: COURSE_LABELS[course],
      remove: (s) => ({ ...s, courses: s.courses.filter((c) => c !== course) }),
    });
  }
  if (state.maxMinutes != null) {
    chips.push({
      key: 'time',
      label: `Up to ${state.maxMinutes} min`,
      remove: (s) => ({ ...s, maxMinutes: null }),
    });
  }
  for (const diet of state.diets) {
    chips.push({
      key: `diet:${diet}`,
      label: labelDiet(diet),
      remove: (s) => ({ ...s, diets: s.diets.filter((d) => d !== diet) }),
    });
  }
  for (const goal of state.goals) {
    chips.push({
      key: `goal:${goal}`,
      label: GOAL_TAG_LABELS[goal],
      remove: (s) => ({ ...s, goals: s.goals.filter((g) => g !== goal) }),
    });
  }
  if (state.maxKcal != null) {
    chips.push({
      key: 'kcal',
      label: `Up to ${state.maxKcal} kcal`,
      remove: (s) => ({ ...s, maxKcal: null }),
    });
  }
  return chips;
}
