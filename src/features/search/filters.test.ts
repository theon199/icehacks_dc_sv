import { DietFlag } from '@/lib/catalog';

import {
  activeFilterChips,
  activeFilterCount,
  EMPTY_FILTERS,
  hasActiveFilters,
  toggleValue,
  toSearchFilters,
  type SearchFilterState,
} from './filters';

const label = (id: string) => id.toUpperCase();

describe('toSearchFilters', () => {
  it('sends no arguments when nothing is picked', () => {
    expect(toSearchFilters(EMPTY_FILTERS)).toEqual({});
  });

  it('maps every picked filter to its query argument', () => {
    const state: SearchFilterState = {
      cuisines: ['thai', 'indian'],
      courses: ['main', 'soup'],
      maxMinutes: 30,
      diets: ['vegetarian', 'gluten_free'],
      goals: ['high_protein', 'high_fiber'],
      maxKcal: 600,
    };
    expect(toSearchFilters(state)).toEqual({
      cuisines: ['indian', 'thai'],
      course: ['main', 'soup'],
      maxMinutes: 30,
      dietMask: DietFlag.vegetarian | DietFlag.gluten_free,
      goals: ['high_fiber', 'high_protein'],
      maxKcal: 600,
    });
  });

  it('passes a single course as a plain value', () => {
    expect(toSearchFilters({ ...EMPTY_FILTERS, courses: ['breakfast'] })).toEqual({
      course: 'breakfast',
    });
  });

  it('gives equal selections equal arguments, whatever the order they were picked in', () => {
    const a = toSearchFilters({
      ...EMPTY_FILTERS,
      cuisines: ['thai', 'greek'],
      goals: ['plant_forward', 'high_fiber'],
    });
    const b = toSearchFilters({
      ...EMPTY_FILTERS,
      cuisines: ['greek', 'thai'],
      goals: ['high_fiber', 'plant_forward'],
    });
    expect(a).toEqual(b);
  });

  it('never narrows by the person’s own allergies, so mismatches stay visible', () => {
    const args = toSearchFilters({ ...EMPTY_FILTERS, diets: ['vegan'] });
    expect(args).not.toHaveProperty('avoidAllergens');
  });
});

describe('active filter helpers', () => {
  const state: SearchFilterState = {
    ...EMPTY_FILTERS,
    cuisines: ['thai'],
    maxMinutes: 15,
    diets: ['vegan'],
    maxKcal: 450,
  };

  it('counts each picked value', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(activeFilterCount(state)).toBe(4);
    expect(hasActiveFilters(state)).toBe(true);
  });

  it('lists one chip per filter, each removing only itself', () => {
    const chips = activeFilterChips(state, label, label);
    expect(chips.map((c) => c.label)).toEqual(['THAI', 'Up to 15 min', 'VEGAN', 'Up to 450 kcal']);
    const withoutTime = chips[1]!.remove(state);
    expect(withoutTime).toEqual({ ...state, maxMinutes: null });
    const withoutThai = chips[0]!.remove(state);
    expect(withoutThai.cuisines).toEqual([]);
    expect(withoutThai.diets).toEqual(['vegan']);
  });

  it('toggles values in and out', () => {
    expect(toggleValue(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleValue(['a', 'b'], 'a')).toEqual(['b']);
  });
});
