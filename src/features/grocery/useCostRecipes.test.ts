import { buildShoppingList, estimateListCost } from '@/domain/shopping';
import type { RecipeDetail } from '@/lib/catalog';

import { toPriceRecords } from './pricing';
import { PANCAKE_RECIPE, priced, SHOPPING_INGREDIENTS } from './testing';
import { buildCostRecipes, costRecipesKey, toShoppingRecipe } from './useCostRecipes';

const WAFFLES: RecipeDetail = { ...PANCAKE_RECIPE, id: 'famara:waffles', servings: 2 };

function entries(key: string) {
  return JSON.parse(key) as [string, number | null][];
}

describe('costRecipesKey', () => {
  it('is equal for equal entries and ignores unusable servings', () => {
    const a = costRecipesKey([{ recipeId: 'x', servings: 2 }, { recipeId: 'y' }]);
    const b = costRecipesKey([
      { recipeId: 'x', servings: 2 },
      { recipeId: 'y', servings: Number.NaN },
    ]);
    expect(a).toBe(b);
    expect(costRecipesKey([{ recipeId: 'x', servings: 3 }])).not.toBe(
      costRecipesKey([{ recipeId: 'x', servings: 2 }]),
    );
    expect(entries(costRecipesKey([{ recipeId: '' }, { recipeId: 'y', servings: -1 }]))).toEqual([
      ['y', null],
    ]);
  });
});

describe('toShoppingRecipe', () => {
  it('plans the servings asked for, or the recipe yield', () => {
    expect(toShoppingRecipe(PANCAKE_RECIPE, 6).plannedServings).toBe(6);
    expect(toShoppingRecipe(PANCAKE_RECIPE).plannedServings).toBe(4);
    expect(toShoppingRecipe(PANCAKE_RECIPE, 0).plannedServings).toBe(4);
  });
});

describe('buildCostRecipes', () => {
  const details = new Map<string, RecipeDetail | null>([
    [PANCAKE_RECIPE.id, PANCAKE_RECIPE],
    [WAFFLES.id, WAFFLES],
    ['gone', null],
  ]);

  it('scales every recipe and adds up the planned servings', () => {
    const state = buildCostRecipes(
      [
        [PANCAKE_RECIPE.id, 8],
        [WAFFLES.id, null],
      ],
      details,
    );
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.recipes.map((r) => [r.recipeId, r.plannedServings])).toEqual([
      [PANCAKE_RECIPE.id, 8],
      [WAFFLES.id, 2],
    ]);
    expect(state.servings).toBe(10);
  });

  it('sums the shopping for several recipes into one estimate', () => {
    const state = buildCostRecipes(
      [
        [PANCAKE_RECIPE.id, null],
        [PANCAKE_RECIPE.id, 4],
      ],
      details,
    );
    if (state.status !== 'ready') throw new Error('expected ready');
    const list = buildShoppingList({ recipes: state.recipes, ingredients: SHOPPING_INGREDIENTS });
    const estimate = estimateListCost({
      items: list.items,
      ingredients: SHOPPING_INGREDIENTS,
      prices: toPriceRecords({
        flour: priced('flour', 400, 1, 'kg'),
        egg: priced('egg', 360, 1, 'dozen'),
      }),
    });
    // Twice 500 g flour ($4.00 for the full kilo) and twice 3 eggs ($1.80 for six).
    expect(estimate.totalCents).toBe(580);
    expect(state.servings).toBe(8);
  });

  it('skips unknown recipes and is unavailable only when none can be read', () => {
    const some = buildCostRecipes(
      [
        ['gone', null],
        [WAFFLES.id, null],
      ],
      details,
    );
    expect(some.status === 'ready' && some.recipes.map((r) => r.recipeId)).toEqual([WAFFLES.id]);
    expect(buildCostRecipes([['gone', null]], details)).toEqual({ status: 'unavailable' });
    expect(buildCostRecipes([], details)).toEqual({ status: 'ready', recipes: [], servings: 0 });
  });
});
