import { DEFAULT_PREFERENCES, type RecipeSummary } from '@/domain';

import { candidate, FIXTURE_CATALOG } from './__fixtures__/catalog';
import { familyExclusions, rankFill, rankPool } from './rankFill';

// Two takes on one dish plus a stand-alone recipe.
const STEW_A = candidate('stew-classic', { familyId: 'stew', cuisine: 'italian' });
const STEW_B = candidate('stew-light', { familyId: 'stew', cuisine: 'italian' });
const TACOS = candidate('tacos', { familyId: 'tacos', cuisine: 'mexican' });
const POOL = [STEW_A, STEW_B, TACOS];

describe('rankPool', () => {
  it('groups recipes by dish family and converts each result only once', () => {
    const pool = rankPool(POOL);
    expect(pool.recipes.map((recipe) => recipe.id)).toEqual([
      'stew-classic',
      'stew-light',
      'tacos',
    ]);
    expect(pool.families.get('stew')).toEqual(['stew-classic', 'stew-light']);
    expect(pool.families.get('tacos')).toEqual(['tacos']);
    expect(rankPool(POOL)).toBe(pool);
  });
});

describe('familyExclusions', () => {
  const { recipes, families } = rankPool(POOL);
  const history = new Map(recipes.map((recipe) => [recipe.id, recipe]));

  it('leaves out every variant of a dish once one of them has been shown', () => {
    expect([...familyExclusions(['stew-light'], families, history)].sort()).toEqual([
      'stew-classic',
      'stew-light',
    ]);
  });

  it('still matches a shown recipe that has left the pool through history', () => {
    const gone: RecipeSummary = { ...recipes[0]!, id: 'stew-slow-cooker' };
    const withGone = new Map(history).set(gone.id, gone);
    expect([...familyExclusions([gone.id], families, withGone)].sort()).toEqual([
      'stew-classic',
      'stew-light',
      'stew-slow-cooker',
    ]);
  });

  it('keeps an unknown id on its own', () => {
    expect([...familyExclusions(['mystery'], families, history)]).toEqual(['mystery']);
  });
});

describe('rankFill', () => {
  const base = {
    prefs: { ...DEFAULT_PREFERENCES, allergens: [], diets: [] },
    now: Date.parse('2026-11-11T12:00:00.000Z'),
    mode: 'forYou' as const,
    seed: 'fill-seed',
    size: 12,
  };

  it('never offers another variant of a dish already on screen', () => {
    const history = new Map<string, RecipeSummary>();
    const cards = rankFill({
      ...base,
      candidates: POOL,
      history,
      hidden: ['stew-classic'],
    });
    expect(cards.map((card) => card.recipe.id)).toEqual(['tacos']);
  });

  it('fills from the rest of a larger pool', () => {
    const history = new Map<string, RecipeSummary>();
    const cards = rankFill({
      ...base,
      candidates: [...POOL, ...FIXTURE_CATALOG],
      history,
      hidden: ['stew-light'],
    });
    const ids = cards.map((card) => card.recipe.id);
    expect(ids).toHaveLength(12);
    expect(ids).not.toContain('stew-classic');
    expect(ids).not.toContain('stew-light');
  });

  it('records the pool in the session history', () => {
    const history = new Map<string, RecipeSummary>();
    rankFill({ ...base, candidates: POOL, history, hidden: [] });
    expect([...history.keys()].sort()).toEqual(['stew-classic', 'stew-light', 'tacos']);
  });
});
