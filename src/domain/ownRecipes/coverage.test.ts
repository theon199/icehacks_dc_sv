import { pantryCoverage, sectionOf } from './coverage';

const line = (name: string, catalogIngredientId: string | null = null) => ({
  name,
  catalogIngredientId,
});

describe('pantryCoverage', () => {
  const recipe = [
    line('chicken thighs', 'chicken_thigh'),
    line('bay leaves', 'bay_leaf'),
    line('salt', 'salt'),
    line('Datu Puti vinegar'),
  ];

  it('counts lines on hand by catalog id or by the same food words, skipping staples', () => {
    const coverage = pantryCoverage(
      recipe,
      [
        { ingredientId: 'chicken_thigh', name: 'Chicken' },
        { ingredientId: null, name: 'datu puti vinegars' },
      ],
      new Set(['salt']),
    );
    expect(coverage).toEqual({
      lines: ['have', 'need', 'staple', 'have'],
      total: 3,
      have: 2,
      missing: ['bay leaves'],
      ready: false,
    });
  });

  it('is ready when only staples are left', () => {
    const coverage = pantryCoverage(
      [line('salt', 'salt'), line('rice', 'rice')],
      [{ ingredientId: 'rice', name: 'rice' }],
      new Set(['salt']),
    );
    expect(coverage.ready).toBe(true);
  });

  it('has nothing on hand with an empty pantry', () => {
    expect(pantryCoverage(recipe, [], new Set()).have).toBe(0);
  });
});

describe('sectionOf', () => {
  it('puts anything not cleared under needs a check, whatever is on hand', () => {
    expect(sectionOf(false, { ready: true })).toBe('needs_check');
    expect(sectionOf(true, { ready: true })).toBe('ready');
    expect(sectionOf(true, { ready: false })).toBe('missing');
  });
});
