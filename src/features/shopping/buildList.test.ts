import { itemText } from '@/domain/shopping';

import { INGREDIENTS, RECIPES, ingredient, line, pantryItem } from './__fixtures__/catalog';
import {
  buildPlannedList,
  ingredientIdsOf,
  pantryEntries,
  type ListRecipe,
  type PlannedListInput,
} from './buildList';
import { catalogNameIndex } from './pantryLink';
import type { PlannedMealRef } from './planRange';

const meal = (
  recipeId: string,
  servings: number,
  date = '2026-11-12',
  portion = 1,
): PlannedMealRef => ({
  date,
  meal: 'dinner',
  recipeId,
  servings,
  portion,
});

function build(overrides: Partial<PlannedListInput> = {}) {
  return buildPlannedList({
    meals: [meal('test:curry', 2), meal('test:fried-rice', 4)],
    recipes: RECIPES,
    ingredients: INGREDIENTS,
    pantry: [],
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

  it('scales by planned servings and by the portion each meal is planned at', () => {
    expect(amountsOf(build({ meals: [meal('test:curry', 4)] }), 'i:rice')).toEqual([[400, 'g']]);
    const half = build({ meals: [meal('test:curry', 4, '2026-11-12', 0.5)] });
    expect(amountsOf(half, 'i:rice')).toEqual([[200, 'g']]);
  });

  it('buys each meal at its own portion when portions are mixed', () => {
    const list = build({
      meals: [
        meal('test:curry', 4, '2026-11-12', 0.5),
        meal('test:fried-rice', 4, '2026-11-12', 1),
        // A snack planned whole stays whole next to half-size meals.
        { ...meal('test:curry', 2, '2026-11-13', 1), meal: 'snack' },
      ],
    });
    // Curry 2 × 100 g + 2 × 100 g, fried rice 4 × 100 g.
    expect(amountsOf(list, 'i:rice')).toEqual([[800, 'g']]);
    // Eggs come from the fried rice alone, planned at full size.
    expect(amountsOf(list, 'i:egg')).toEqual([[4, 'each']]);
    expect(list.mealCount).toBe(3);
  });

  it('matches the list for the same food planned as fewer whole servings', () => {
    const portioned = build({
      meals: [
        meal('test:curry', 4, '2026-11-12', 0.5),
        meal('test:fried-rice', 2, '2026-11-13', 2),
      ],
    });
    const folded = build({
      meals: [meal('test:curry', 2, '2026-11-12'), meal('test:fried-rice', 4, '2026-11-13')],
    });
    expect(portioned.items).toEqual(folded.items);
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

  it('ignores free-text pantry items whose name is not a catalog ingredient', () => {
    expect(pantryEntries([pantryItem('p1', null, 3)])).toEqual([]);
    const loose = { ...pantryItem('p1', null, 9), name: 'red onion' };
    expect(amountsOf(build({ pantry: [loose] }), 'i:onion')).toEqual([[3, 'each']]);
  });

  it('treats a free-text item named like a catalog ingredient as that ingredient', () => {
    const names = catalogNameIndex(INGREDIENTS);
    const eggs = { ...pantryItem('p1', null, 2), name: '  Eggs ' };
    expect(pantryEntries([eggs], names)).toEqual([
      { ingredient_id: 'egg', quantity: 2, unit: null },
    ]);
    // The plural and the name both link; 4 eggs planned, 2 at home.
    expect(amountsOf(build({ pantry: [eggs] }), 'i:egg')).toEqual([[2, 'each']]);
    const onion = { ...pantryItem('p2', null, null), name: 'Onion' };
    expect(build({ pantry: [onion] }).inPantry.map((i) => i.key)).toContain('i:onion');
  });

  it('leaves a name two catalog ingredients share unlinked', () => {
    const names = catalogNameIndex([
      ...INGREDIENTS,
      ingredient('spring_onion', 'produce', { name: 'onion' }),
    ]);
    expect(names.get('onion')).toBeNull();
    expect(pantryEntries([{ ...pantryItem('p1', null, 2), name: 'onion' }], names)).toEqual([]);
  });

  describe('an unmatched line naming a planned catalog ingredient', () => {
    const sideSalad: ListRecipe = {
      id: 'test:side',
      servings: 1,
      ingredients: [line(1, null, 1, null, '1 onion, sliced')],
    };
    const withSide = (pantry: PlannedListInput['pantry']) =>
      build({
        meals: [meal('test:curry', 2), meal('test:fried-rice', 4), meal('test:side', 1)],
        recipes: new Map([...RECIPES, [sideSalad.id, sideSalad]]),
        pantry,
      });

    it('merges into the catalog item instead of listing the same thing twice', () => {
      const list = withSide([]);
      expect(amountsOf(list, 'i:onion')).toEqual([[4, 'each']]);
      expect(list.items.map((i) => i.key)).not.toContain('t:onion');
      expect(list.items.find((i) => i.key === 'i:onion')?.recipeIds).toContain('test:side');
    });

    it('is covered by a linked free-text pantry entry with enough stock', () => {
      const list = withSide([{ ...pantryItem('p1', null, 10), name: 'onion' }]);
      const keys = list.items.map((i) => i.key);
      expect(keys).not.toContain('t:onion');
      expect(keys).not.toContain('i:onion');
      expect(list.inPantry.map((i) => i.key)).toContain('i:onion');
    });

    it('counts the pantry entry once across both lines', () => {
      const list = withSide([{ ...pantryItem('p1', null, 3), name: 'Onions' }]);
      expect(amountsOf(list, 'i:onion')).toEqual([[1, 'each']]);
    });
  });

  it('links only to ingredients the plan uses, so other names still cover unmatched lines', () => {
    const coriander = ingredient('coriander', 'produce', { name: 'fresh coriander' });
    const list = build({
      ingredients: [...INGREDIENTS, coriander],
      pantry: [{ ...pantryItem('c', null, 1, 'handful'), name: 'Fresh coriander' }],
    });
    expect(list.inPantry.map((i) => i.key)).toContain('t:fresh coriander');
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
