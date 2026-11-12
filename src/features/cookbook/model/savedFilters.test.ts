import {
  DEFAULT_SAVED_FILTERS,
  filterSaved,
  hasActiveFilters,
  searchTokens,
  type SavedFilters,
} from './savedFilters';
import { makeCandidate } from '../__fixtures__/recipes';

const recipes = [
  makeCandidate('1', { title: 'Crème brûlée oats', course: 'breakfast', totalMinutes: 10 }),
  makeCandidate('2', { title: 'Chickpea curry', cuisine: 'indian', totalMinutes: 40 }),
  makeCandidate('3', { title: 'Miso soup', cuisine: 'japanese', course: 'soup', gentle: true }),
  makeCandidate('4', { title: 'Spiced nuts', course: 'snack', totalMinutes: null }),
];

const ids = (list: { id: string }[]) => list.map((r) => r.id);
const withFilters = (patch: Partial<SavedFilters>) =>
  filterSaved(recipes, { ...DEFAULT_SAVED_FILTERS, ...patch });

describe('saved recipe filters', () => {
  it('returns everything, in order, with no filters', () => {
    expect(ids(withFilters({}))).toEqual(['1', '2', '3', '4']);
    expect(hasActiveFilters(DEFAULT_SAVED_FILTERS)).toBe(false);
  });

  it('matches word prefixes in the title and cuisine, ignoring accents and case', () => {
    expect(ids(withFilters({ query: 'creme' }))).toEqual(['1']);
    expect(ids(withFilters({ query: 'CHICK cur' }))).toEqual(['2']);
    expect(ids(withFilters({ query: 'japan' }))).toEqual(['3']);
    expect(ids(withFilters({ query: 'urry' }))).toEqual([]);
  });

  it('groups courses', () => {
    expect(ids(withFilters({ course: 'mains' }))).toEqual(['2', '3']);
    expect(ids(withFilters({ course: 'sides' }))).toEqual(['4']);
    expect(ids(withFilters({ course: 'breakfast' }))).toEqual(['1']);
  });

  it('keeps only known quick times and gentle recipes when asked', () => {
    expect(ids(withFilters({ quick: true }))).toEqual(['1', '3']);
    expect(ids(withFilters({ gentle: true }))).toEqual(['3']);
    expect(hasActiveFilters({ ...DEFAULT_SAVED_FILTERS, quick: true })).toBe(true);
  });

  it('tokenizes punctuation away', () => {
    expect(searchTokens("  Mom's  pho-bo! ")).toEqual(['mom', 's', 'pho', 'bo']);
  });
});
