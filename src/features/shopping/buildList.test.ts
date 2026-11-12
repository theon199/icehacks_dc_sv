import { itemText } from '@/domain/shopping';

import { INGREDIENTS, RECIPES, pantryItem } from './__fixtures__/catalog';
import {
  buildPlannedList,
  ingredientIdsOf,
  pantryEntries,
  type PlannedListInput,
} from './buildList';
import type { PlannedMealRef } from './planRange';

const meal = (recipeId: string, servings: number, date = '2026-11-12'): PlannedMealRef => ({
  date,
  meal: 'dinner',
  recipeId,
  servings,
});

function build(overrides: Partial<PlannedListInput> = {}) {
  return buildPlannedList({
    meals: [meal('test:curry', 2), meal('test:fried-rice', 4)],
    recipes: RECIPES,
    ingredients: INGREDIENTS,
    pantry: [],
    portion: 1,
    ...overrides,
  });
}

const amountsOf = (list: ReturnType<typeof build>, key: string) =>
  list.items.find((item) => item.key === key)?.amounts.map((a) => [a.quantity, a.unit ?? a.label]);

describe('list generation from the plan', () => {
  it('merges the same ingredient across planned recipes', () => {
    const list = build();
    expect(amountsOf(list, 'i:onion')).toEqual([[3, 'each']]);
    expect(amountsOf(list, 'i:rice')).toEqual([[600, 'g']]);
    expect(list.items.find((i) => i.key === 'i:onion')?.recipeIds).toEqual([
      'test:curry',
      'test:fried-rice',
    ]);
    expect(list.mealCount).toBe(2);
  });

  it('scales by planned servings and by the small-appetite portion', () => {
    expect(amountsOf(build({ meals: [meal('test:curry', 4)] }), 'i:rice')).toEqual([[400, 'g']]);
    expect(amountsOf(build({ meals: [meal('test:curry', 4)], portion: 0.5 }), 'i:rice')).toEqual([
      [200, 'g'],
    ]);
  });

  it('counts a recipe planned twice twice', () => {
    const list = build({ meals: [meal('test:curry', 2), meal('test:curry', 2, '2026-11-13')] });
    expect(amountsOf(list, 'i:chickpea')).toEqual([[2, 'can']]);
  });

  it('keeps unmatched lines as their own items', () => {
    const coriander = build().items.find((item) => item.ingredientId === null);
    expect(coriander).toMatchObject({ name: 'fresh coriander', aisle: 'other' });
  });

  it('reports planned recipes the catalog no longer has, and lists the rest', () => {
    const list = build({ meals: [meal('test:curry', 2), meal('gone:1', 2)] });
    expect(list.missingRecipeIds).toEqual(['gone:1']);
    expect(list.mealCount).toBe(1);
    expect(list.items.length).toBeGreaterThan(0);
  });
});

describe('subtracting the pantry', () => {
  it('reduces amounts by what is on hand and keeps partly covered items on the list', () => {
    const list = build({ pantry: [pantryItem('p1', 'rice', 250, 'g')] });
    expect(amountsOf(list, 'i:rice')).toEqual([[350, 'g']]);
    expect(list.items.find((i) => i.key === 'i:rice')?.pantry).toBe('partial');
  });

  it('converts between units through the ingredient weights', () => {
    // 2 cups at 185 g a cup is 370 g of the 600 g needed.
    const list = build({ pantry: [pantryItem('p1', 'rice', 2, 'cup')] });
    expect(amountsOf(list, 'i:rice')).toEqual([[230, 'g']]);
  });

  it('moves fully covered items to the "already have" section', () => {
    const list = build({
      pantry: [pantryItem('p1', 'onion', 5), pantryItem('p2', 'salt', null)],
    });
    expect(list.items.map((i) => i.key)).not.toContain('i:onion');
    expect(list.inPantry.map((i) => i.key)).toEqual(expect.arrayContaining(['i:onion', 'i:salt']));
  });

  it('ignores free-text pantry items, which cannot be matched safely', () => {
    expect(pantryEntries([pantryItem('p1', null, 3)])).toEqual([]);
    expect(amountsOf(build({ pantry: [pantryItem('onion', null, 9)] }), 'i:onion')).toEqual([
      [3, 'each'],
    ]);
  });
});

describe('aisle grouping', () => {
  it('walks the store fresh food first and leaves unknown aisles for last', () => {
    const list = build();
    expect(list.groups.map((g) => g.aisle)).toEqual([
      'produce',
      'meat_seafood',
      'dairy_eggs',
      'grains_pasta',
      'canned_jarred',
      'spices',
      'other',
    ]);
    expect(list.groups.map((g) => g.title)).toEqual([
      'Produce',
      'Meat & seafood',
      'Dairy & eggs',
      'Grains & pasta',
      'Cans & jars',
      'Herbs & spices',
      'Everything else',
    ]);
  });

  it('puts every item to buy in exactly one aisle', () => {
    const list = build();
    const grouped = list.groups.flatMap((g) => g.items.map((i) => i.key));
    expect(grouped.sort()).toEqual(list.items.map((i) => i.key).sort());
  });

  it('reads naturally', () => {
    const produce = build().groups[0];
    expect(produce?.items.map((item) => itemText(item, { system: 'us' }))).toEqual(['3 onions']);
  });
});

it('collects the ingredient ids the recipes use, once each', () => {
  expect(ingredientIdsOf(RECIPES.values())).toEqual([
    'chicken_breast',
    'chickpea',
    'egg',
    'onion',
    'rice',
    'salt',
  ]);
});
