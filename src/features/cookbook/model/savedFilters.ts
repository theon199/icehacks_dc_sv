/**
 * Search and filters for the Saved grid. Saved collections are small (at most a few thousand), so
 * this runs in memory over summaries the catalog already returned, keeping their order.
 */
import { cuisineLabel } from '@/domain/types';
import type { Course, RecipeSummary } from '@/lib/catalog';

export const COURSE_FILTERS = ['all', 'breakfast', 'mains', 'sides'] as const;
export type CourseFilter = (typeof COURSE_FILTERS)[number];

export const COURSE_FILTER_LABELS: Readonly<Record<CourseFilter, string>> = {
  all: 'All',
  breakfast: 'Breakfast',
  mains: 'Mains',
  sides: 'Sides & snacks',
};

const COURSE_GROUPS: Readonly<Record<Exclude<CourseFilter, 'all'>, readonly Course[]>> = {
  breakfast: ['breakfast'],
  mains: ['main', 'soup', 'salad'],
  sides: ['side', 'snack', 'dessert', 'drink'],
};

/** "Quick" means a known total time at or under this many minutes. */
export const QUICK_MINUTES = 30;

export interface SavedFilters {
  readonly query: string;
  readonly course: CourseFilter;
  readonly quick: boolean;
  readonly gentle: boolean;
}

export const DEFAULT_SAVED_FILTERS: SavedFilters = {
  query: '',
  course: 'all',
  quick: false,
  gentle: false,
};

/** Lowercase, accent-free words, so "creme" finds "Crème". */
export function searchTokens(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function haystack(recipe: RecipeSummary): string {
  return searchTokens(`${recipe.title} ${cuisineLabel(recipe.cuisine)} ${recipe.cuisine}`).join(
    ' ',
  );
}

export function hasActiveFilters(filters: SavedFilters): boolean {
  return (
    filters.query.trim().length > 0 || filters.course !== 'all' || filters.quick || filters.gentle
  );
}

/** Recipes matching every active filter; every query word must prefix a word of the recipe. */
export function filterSaved(
  recipes: readonly RecipeSummary[],
  filters: SavedFilters,
): RecipeSummary[] {
  const words = searchTokens(filters.query);
  const courses = filters.course === 'all' ? null : COURSE_GROUPS[filters.course];
  return recipes.filter((recipe) => {
    if (courses && !courses.includes(recipe.course)) return false;
    if (filters.quick && (recipe.totalMinutes == null || recipe.totalMinutes > QUICK_MINUTES)) {
      return false;
    }
    if (filters.gentle && !recipe.gentle) return false;
    if (words.length === 0) return true;
    const text = ` ${haystack(recipe)}`;
    return words.every((w) => text.includes(` ${w}`));
  });
}
