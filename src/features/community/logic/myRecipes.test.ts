import { pickerLookupIds, recentCookedRecipeIds } from './myRecipes';

const entry = (recipeId: string, cookedAt: string) => ({ recipeId, cookedAt });

describe('recentCookedRecipeIds', () => {
  it('lists each recipe once, most recently cooked first', () => {
    const ids = recentCookedRecipeIds(
      [
        entry('mealdb:1', '2026-11-01T10:00:00Z'),
        entry('mealdb:2', '2026-11-03T10:00:00Z'),
        entry('mealdb:1', '2026-11-05T10:00:00Z'),
      ],
      10,
    );
    expect(ids).toEqual(['mealdb:1', 'mealdb:2']);
  });

  it('leaves out ids with a skipped prefix', () => {
    const ids = recentCookedRecipeIds(
      [entry('snap:pho', '2026-11-05T10:00:00Z'), entry('mealdb:3', '2026-11-04T10:00:00Z')],
      10,
      ['snap:'],
    );
    expect(ids).toEqual(['mealdb:3']);
  });

  it('stops at the limit', () => {
    const entries = ['a', 'b', 'c'].map((id, day) => entry(id, `2026-11-0${day + 1}T10:00:00Z`));
    expect(recentCookedRecipeIds(entries, 2)).toEqual(['c', 'b']);
  });
});

describe('pickerLookupIds', () => {
  it('caps each section and drops repeats', () => {
    expect(pickerLookupIds(['s1', 'c1', 's2', 's3'], ['c1', 'c2', 'c3'], 2)).toEqual([
      'c1',
      'c2',
      's1',
    ]);
  });
});
