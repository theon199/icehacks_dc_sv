import { screenIds } from './screenIds';
import { makeRecipe } from '../recommend/fixtures/makeRecipe';
import { DietFlag } from '../types/diet';
import { type RecipeSummary } from '../types/recipe';

const safeSoup = makeRecipe({ id: 'r:soup', dietFlags: DietFlag.vegetarian });
const peanutNoodles = makeRecipe({ id: 'r:noodles', allergens: { peanut: 'contains' } });
const stockStew = makeRecipe({ id: 'r:stew', allergens: { peanut: 'unknown' } });
const chickenRice = makeRecipe({ id: 'r:chicken', dietFlags: 0 });

const catalog = new Map<string, RecipeSummary>(
  [safeSoup, peanutNoodles, stockStew, chickenRice].map((r) => [r.id, r]),
);

describe('screenIds', () => {
  it('keeps only eligible recipes, in the order suggested', () => {
    const result = screenIds(['r:stew', 'r:soup', 'r:noodles'], catalog, {
      allergens: ['peanut'],
      diets: [],
    });
    expect(result.safe.map((r) => r.id)).toEqual(['r:soup']);
    expect(result.rejected).toEqual([
      { id: 'r:stew', reasons: [expect.objectContaining({ code: 'allergen_unverified' })] },
      { id: 'r:noodles', reasons: [expect.objectContaining({ code: 'contains_allergen' })] },
    ]);
  });

  it('rejects ids the catalog does not know', () => {
    const result = screenIds(['r:made-up'], catalog, { allergens: [], diets: [] });
    expect(result.safe).toEqual([]);
    expect(result.rejected[0]?.reasons[0]?.code).toBe('not_in_catalog');
  });

  it('rejects malformed ids instead of throwing', () => {
    const result = screenIds([42, null, '  ', { id: 'r:soup' }], catalog, {
      allergens: [],
      diets: [],
    });
    expect(result.safe).toEqual([]);
    expect(result.rejected.every((r) => r.reasons[0]?.code === 'not_in_catalog')).toBe(true);
  });

  it('removes duplicates and trims whitespace', () => {
    const result = screenIds(['r:soup', ' r:soup ', 'r:soup'], catalog, {
      allergens: [],
      diets: [],
    });
    expect(result.safe).toEqual([safeSoup]);
    expect(result.rejected).toEqual([]);
  });

  it('applies diets as well as allergens', () => {
    const result = screenIds(['r:chicken', 'r:soup'], catalog, {
      allergens: [],
      diets: ['vegetarian'],
    });
    expect(result.safe.map((r) => r.id)).toEqual(['r:soup']);
    expect(result.rejected[0]?.reasons[0]).toEqual(
      expect.objectContaining({ code: 'diet_mismatch', diet: 'vegetarian' }),
    );
  });

  it('accepts a lookup function and distrusts mismatched answers', () => {
    const lookup = (id: string) => (id === 'r:alias' ? safeSoup : catalog.get(id));
    const result = screenIds(['r:alias', 'r:soup'], lookup, { allergens: [], diets: [] });
    expect(result.safe.map((r) => r.id)).toEqual(['r:soup']);
    expect(result.rejected[0]).toEqual({
      id: 'r:alias',
      reasons: [expect.objectContaining({ code: 'not_in_catalog' })],
    });
  });
});
