import { screenSuggestedIds, finderFor } from './screening';
import { recipe } from '../__fixtures__/recipe';

const soup = recipe('r:soup', { dietFlags: 1 | 2 });
const satay = recipe('r:satay', { allergens: { peanut: 'contains' } });
const stew = recipe('r:stew', { allergens: { peanut: 'unknown' } });
const steak = recipe('r:steak', { dietFlags: 0 });
const find = finderFor([soup, satay, stew, steak]);

describe('screenSuggestedIds', () => {
  it('drops recipes that contain or may contain a declared allergen', () => {
    const result = screenSuggestedIds(['r:satay', 'r:soup', 'r:stew'], find, {
      allergens: ['peanut'],
      diets: [],
    });
    expect(result.safe.map((r) => r.id)).toEqual(['r:soup']);
    expect(result.dropped).toEqual(['r:satay', 'r:stew']);
  });

  it('drops recipes outside the followed diets', () => {
    const result = screenSuggestedIds(['r:steak', 'r:soup'], find, {
      allergens: [],
      diets: ['vegetarian'],
    });
    expect(result.safe.map((r) => r.id)).toEqual(['r:soup']);
    expect(result.dropped).toEqual(['r:steak']);
  });

  it('drops ids the catalog does not know, and malformed ids, without throwing', () => {
    const result = screenSuggestedIds(['r:invented', 42, null, '  '], find, {
      allergens: [],
      diets: [],
    });
    expect(result.safe).toEqual([]);
    expect(result.dropped).toHaveLength(4);
  });

  it('never trusts a lookup that answers with another recipe', () => {
    const wrong = () => soup;
    const result = screenSuggestedIds(['r:other'], wrong, { allergens: [], diets: [] });
    expect(result.safe).toEqual([]);
  });

  it('keeps the suggested order and removes duplicates', () => {
    const result = screenSuggestedIds(['r:steak', ' r:soup', 'r:soup', 'r:steak'], find, {
      allergens: [],
      diets: [],
    });
    expect(result.safe.map((r) => r.id)).toEqual(['r:steak', 'r:soup']);
  });

  it('shows nothing while the allergen question is unanswered', () => {
    const result = screenSuggestedIds(['r:soup'], find, { allergens: null, diets: [] });
    expect(result.safe).toEqual([]);
    expect(result.dropped).toEqual(['r:soup']);
  });
});
