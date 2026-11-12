import { createRankContext } from './context';
import { CATALOG } from './fixtures/catalog';
import { makeRecipe } from './fixtures/makeRecipe';
import { rankRecipes, scoreCandidates, sortIndices } from './rank';
import { scoreRecipe } from './score';
import { DEFAULT_PREFERENCES } from '../types/preferences';

const NOW = Date.UTC(2026, 10, 1);

describe('sortIndices', () => {
  it('sorts by key descending and breaks ties by id', () => {
    const keys = Float64Array.from([0.2, 0.9, 0.2, 0.5]);
    expect([...sortIndices(keys, ['d', 'a', 'b', 'c'])]).toEqual([1, 3, 2, 0]);
  });
});

describe('scoreCandidates', () => {
  it('matches single-recipe scoring', () => {
    const ctx = createRankContext(
      { prefs: { ...DEFAULT_PREFERENCES, cuisines: ['thai'], goals: ['more_fiber'] }, now: NOW },
      CATALOG,
    );
    const batch = scoreCandidates(CATALOG, ctx);
    CATALOG.forEach((target, i) => {
      const single = scoreRecipe(target, ctx);
      expect(batch.score[i]).toBeCloseTo(single.score, 12);
      expect(batch.base[i]).toBeCloseTo(single.base, 12);
    });
  });
});

describe('rankRecipes', () => {
  it('drops unsafe recipes and sorts best first', () => {
    const ranked = rankRecipes(CATALOG, {
      prefs: { ...DEFAULT_PREFERENCES, allergens: ['milk'], cuisines: ['indian'] },
      now: NOW,
    });
    expect(ranked.length).toBeGreaterThan(0);
    for (const entry of ranked) expect(entry.recipe.allergens.milk).toBe('free');
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.score).toBeGreaterThanOrEqual(ranked[i]!.score);
    }
    expect(ranked[0]!.recipe.cuisine).toBe('indian');
  });

  it('honours a limit', () => {
    expect(rankRecipes(CATALOG, { prefs: DEFAULT_PREFERENCES, now: NOW }, 3)).toHaveLength(3);
    expect(rankRecipes(CATALOG, { prefs: DEFAULT_PREFERENCES, now: NOW }, -1)).toHaveLength(0);
  });

  it('returns nothing for an empty catalog', () => {
    expect(rankRecipes([], { prefs: DEFAULT_PREFERENCES, now: NOW })).toEqual([]);
  });

  it('keeps the caller’s recipe objects', () => {
    const custom = { ...makeRecipe({ id: 'x:1' }), extra: 'kept' };
    const [first] = rankRecipes([custom], { prefs: DEFAULT_PREFERENCES, now: NOW });
    expect(first?.recipe).toBe(custom);
  });
});
