import { DEFAULT_RANKING_CONFIG, DietFlag } from '@/domain';

import {
  availableModes,
  CANDIDATE_LIMIT,
  candidateFilters,
  MEAL_COURSES,
  resolveMode,
  WIDE_CANDIDATE_LIMIT,
} from './modes';

const answered = { allergens: [], diets: [] };

describe('modes', () => {
  it('offers Gentle only with small appetite mode on', () => {
    expect(availableModes(false).map((mode) => mode.value)).toEqual(['forYou', 'quick', 'pantry']);
    expect(availableModes(true).map((mode) => mode.value)).toContain('gentle');
    expect(resolveMode('gentle', false)).toBe('forYou');
    expect(resolveMode('gentle', true)).toBe('gentle');
    expect(resolveMode('quick', false)).toBe('quick');
  });
});

describe('candidateFilters', () => {
  it('runs no query until both safety questions are answered', () => {
    expect(candidateFilters({ allergens: null, diets: [] }, 'forYou', false)).toBeNull();
    expect(candidateFilters({ allergens: [], diets: null }, 'forYou', false)).toBeNull();
  });

  it('keeps allergens and diets out in SQL, fail-closed', () => {
    const filters = candidateFilters(
      { allergens: ['sesame', 'peanut'], diets: ['vegan', 'no_pork'] },
      'forYou',
      false,
    );
    expect(filters).toMatchObject({
      avoidAllergens: ['peanut', 'sesame'],
      excludeDietMask: DietFlag.vegan | DietFlag.no_pork,
      course: MEAL_COURSES,
      limit: CANDIDATE_LIMIT,
    });
  });

  it('narrows by time for Quick and by tag for Gentle', () => {
    expect(candidateFilters(answered, 'quick', false)?.maxMinutes).toBe(
      DEFAULT_RANKING_CONFIG.feed.quickMaxMinutes,
    );
    expect(candidateFilters(answered, 'gentle', false)?.gentle).toBe(true);
    expect(candidateFilters(answered, 'pantry', false)).not.toHaveProperty('maxMinutes');
  });

  it('draws from every course and a larger pool when widened', () => {
    const filters = candidateFilters(answered, 'forYou', true);
    expect(filters).not.toHaveProperty('course');
    expect(filters?.limit).toBe(WIDE_CANDIDATE_LIMIT);
  });
});
