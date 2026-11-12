import {
  buildShoppingList,
  checkProgress,
  checkReducer,
  costItem,
  estimateListCost,
  estimateRecipeCost,
  groupByAisle,
  initialCheckState,
  isChecked,
  itemText,
  normalizeAisle,
  orderForDisplay,
  shoppingListText,
  unmatchedKey,
  type CheckState,
  type PriceRecord,
  type ShoppingIngredient,
  type ShoppingItem,
  type ShoppingLine,
  type ShoppingRecipe,
} from './index';

const INGREDIENTS: Record<string, ShoppingIngredient> = {
  flour: { id: 'flour', name: 'flour', aisle: 'Baking', grams_per_unit: { cup: 125 } },
  milk: { id: 'milk', name: 'milk', aisle: 'Dairy', grams_per_unit: { cup: 245 } },
  egg: { id: 'egg', name: 'egg', plural: 'eggs', aisle: 'Dairy', grams_per_unit: { each: 50 } },
  onion: {
    id: 'onion',
    name: 'onion',
    plural: 'onions',
    aisle: 'Produce',
    grams_per_unit: { each: 110, cup: 160 },
  },
  garlic: { id: 'garlic', name: 'garlic', aisle: 'Produce', grams_per_unit: { clove: 3 } },
  chickpea: { id: 'chickpea', name: 'chickpeas', aisle: 'canned' },
  salt: { id: 'salt', name: 'salt', aisle: 'spices', pantry_staple: 1 },
  olive_oil: { id: 'olive_oil', name: 'olive oil', aisle: 'Oils', pantry_staple: true },
  cumin: { id: 'cumin', name: 'cumin', aisle: 'spices' },
  tahini: { id: 'tahini', name: 'tahini', aisle: 'International Foods' },
};

function l(
  ingredient_id: string | null,
  quantity: number | null,
  unit: string | null,
  extra: Partial<ShoppingLine> = {},
): ShoppingLine {
  return {
    ingredient_id,
    text: `${quantity ?? ''} ${unit ?? ''} ${ingredient_id ?? ''}`,
    quantity,
    unit,
    ...extra,
  };
}

const pancakes: ShoppingRecipe = {
  recipeId: 'r:pancakes',
  servings: 4,
  plannedServings: 4,
  ingredients: [
    l('flour', 1.5, 'cups'),
    l('milk', 1.25, 'cup'),
    l('egg', 1, null),
    l('salt', 0.5, 'tsp'),
  ],
};

const hummusBowl: ShoppingRecipe = {
  recipeId: 'r:hummus',
  servings: 2,
  plannedServings: 4,
  ingredients: [
    l('chickpea', 1, 'can'),
    l('tahini', 3, 'tbsp'),
    l('garlic', 1, 'clove'),
    l('onion', 0.5, null),
    l('olive_oil', 2, 'tbsp'),
    l('cumin', null, null, { text: 'cumin, to taste' }),
    l(null, 1, 'bunch', { text: '1 bunch fresh parsley, chopped' }),
  ],
};

const frittata: ShoppingRecipe = {
  recipeId: 'r:frittata',
  servings: 4,
  plannedServings: 2,
  ingredients: [
    l('egg', 6, null),
    l('onion', 1, 'cup'),
    l('milk', 100, 'ml'),
    l('flour', 20, 'g'),
    l('garlic', 2, 'cloves', { optional: true }),
  ],
};

function find(items: readonly ShoppingItem[], key: string): ShoppingItem {
  const item = items.find((i) => i.key === key);
  if (!item) throw new Error(`missing ${key}`);
  return item;
}

describe('buildShoppingList', () => {
  const list = buildShoppingList({
    recipes: [pancakes, hummusBowl, frittata],
    ingredients: INGREDIENTS,
  });

  it('scales each recipe to its planned servings', () => {
    expect(find(list.items, 'i:chickpea').amounts).toEqual([
      { quantity: 2, unit: 'can', label: null },
    ]);
    expect(find(list.items, 'i:tahini').amounts[0]?.quantity).toBeCloseTo(6 * 14.7868, 2);
  });

  it('merges mixed units of one ingredient through its weights', () => {
    // 1.5 cups (187.5 g) + 20 g × ½ = 197.5 g of flour.
    expect(find(list.items, 'i:flour').amounts).toEqual([
      { quantity: expect.closeTo(197.5, 6), unit: 'g', label: null },
    ]);
    // 1.25 cups of milk + 50 ml: both volumes, so they stay a volume.
    const milk = find(list.items, 'i:milk').amounts;
    expect(milk).toHaveLength(1);
    expect(milk[0]?.unit).toBe('ml');
    expect(milk[0]?.quantity).toBeCloseTo(1.25 * 236.588 + 50, 2);
  });

  it('folds whole items into grams when an ingredient appears as items and cups', () => {
    // onion: 1 whole (110 g) from the bowl + ½ cup (80 g) from the frittata.
    expect(find(list.items, 'i:onion').amounts).toEqual([
      { quantity: expect.closeTo(190, 6), unit: 'g', label: null },
    ]);
  });

  it('rounds counts up to whole items', () => {
    // 1 egg + 6 × ½ = 4 eggs; 2 cloves + 1 = 3 cloves.
    expect(find(list.items, 'i:egg').amounts).toEqual([{ quantity: 4, unit: 'each', label: null }]);
    expect(find(list.items, 'i:garlic').amounts).toEqual([
      { quantity: 3, unit: 'clove', label: null },
    ]);
    expect(find(list.items, 'i:garlic').optional).toBe(false);
  });

  it('keeps unmatched lines and unquantified uses', () => {
    const parsley = find(list.items, 't:fresh parsley');
    expect(parsley.name).toBe('fresh parsley');
    expect(parsley.aisle).toBe('other');
    expect(parsley.amounts).toEqual([{ quantity: 2, unit: 'bunch', label: null }]);
    const cumin = find(list.items, 'i:cumin');
    expect(cumin.amounts).toEqual([]);
    expect(cumin.asNeeded).toBe(true);
  });

  it('records which recipes use each item and flags staples', () => {
    expect(find(list.items, 'i:egg').recipeIds).toEqual(['r:frittata', 'r:pancakes']);
    expect(find(list.items, 'i:salt').staple).toBe(true);
    expect(find(list.items, 'i:olive_oil').staple).toBe(true);
  });

  it('sorts by name and groups by aisle in store order', () => {
    const groups = groupByAisle(list.items);
    expect(groups.map((g) => g.aisle)).toEqual([
      'produce',
      'dairy',
      'canned',
      'baking',
      'spices',
      'oils',
      'international_foods', // not a standard aisle: after the known ones, before other
      'other',
    ]);
    expect(groups[0]?.items.map((i) => i.name)).toEqual(['garlic', 'onion']);
    expect(groups[1]?.items.map((i) => i.name)).toEqual(['egg', 'milk']);
    expect(groups[6]?.title).toBe('International foods');
  });

  it('does not depend on recipe or line order (property)', () => {
    const recipes = [pancakes, hummusBowl, frittata];
    let seed = 17;
    const shuffle = <T>(xs: readonly T[]) =>
      [...xs].sort(() => {
        seed = (seed * 16807) % 2147483647;
        return (seed % 3) - 1;
      });
    for (let i = 0; i < 10; i += 1) {
      const shuffled = shuffle(recipes).map((r) => ({ ...r, ingredients: shuffle(r.ingredients) }));
      const again = buildShoppingList({ recipes: shuffled, ingredients: INGREDIENTS });
      expect(groupByAisle(again.items)).toEqual(groupByAisle(list.items));
    }
  });

  it('marks an ingredient optional only when every use is optional', () => {
    const only = buildShoppingList({
      recipes: [{ ...frittata, ingredients: [l('garlic', 2, 'cloves', { optional: 1 })] }],
      ingredients: INGREDIENTS,
    });
    expect(only.items[0]?.optional).toBe(true);
  });

  it('keeps unknown units separately unless the line has a weight', () => {
    const odd = buildShoppingList({
      recipes: [
        {
          recipeId: 'x',
          servings: 1,
          plannedServings: 1,
          ingredients: [
            l('cumin', 2, 'shakes'),
            l('cumin', 1, 'knob', { grams: 5 }),
            l('cumin', 3, 'g'),
          ],
        },
      ],
      ingredients: INGREDIENTS,
    });
    expect(odd.items[0]?.amounts).toEqual([
      { quantity: 8, unit: 'g', label: null },
      { quantity: 2, unit: null, label: 'shakes' },
    ]);
  });

  it('applies small-appetite portions', () => {
    const half = buildShoppingList({
      recipes: [{ ...hummusBowl, portion: 0.5 }],
      ingredients: INGREDIENTS,
    });
    expect(find(half.items, 'i:chickpea').amounts[0]?.quantity).toBe(1);
  });
});

describe('pantry subtraction', () => {
  it('moves fully covered items to the pantry section', () => {
    const list = buildShoppingList({
      recipes: [pancakes, hummusBowl],
      ingredients: INGREDIENTS,
      pantry: [{ ingredient_id: 'flour' }, { ingredient_id: 'cumin' }],
    });
    expect(list.items.map((i) => i.key)).not.toContain('i:flour');
    const flour = find(list.inPantry, 'i:flour');
    expect(flour.pantry).toBe('covered');
    expect(flour.amounts[0]).toEqual({
      quantity: expect.closeTo(1.5 * 236.588, 2),
      unit: 'ml',
      label: null,
    });
    expect(find(list.inPantry, 'i:cumin').pantry).toBe('covered');
  });

  it('subtracts quantities across units and keeps the remainder', () => {
    const list = buildShoppingList({
      recipes: [pancakes],
      ingredients: INGREDIENTS,
      pantry: [
        { ingredient_id: 'flour', quantity: 100, unit: 'g' },
        { ingredient_id: 'milk', quantity: 1, unit: 'cup' },
        { ingredient_id: 'egg', quantity: 6, unit: null },
      ],
    });
    const flour = find(list.items, 'i:flour');
    expect(flour.pantry).toBe('partial');
    // 1.5 cups of flour is a volume; 100 g of it is 0.8 cup at 125 g per cup.
    expect(flour.amounts[0]?.unit).toBe('ml');
    expect(flour.amounts[0]?.quantity).toBeCloseTo(0.7 * 236.588, 2);
    expect(find(list.items, 'i:milk').amounts[0]?.quantity).toBeCloseTo(0.25 * 236.588, 2);
    expect(find(list.inPantry, 'i:egg').pantry).toBe('covered');
  });

  it('leaves an item alone when the pantry unit cannot be converted', () => {
    const list = buildShoppingList({
      recipes: [hummusBowl],
      ingredients: INGREDIENTS,
      pantry: [{ ingredient_id: 'tahini', quantity: 1, unit: 'each' }],
    });
    expect(find(list.items, 'i:tahini').pantry).toBe('none');
  });

  it('never buys more than the plan needs (property)', () => {
    for (let have = 0; have <= 12; have += 1) {
      const list = buildShoppingList({
        recipes: [frittata],
        ingredients: INGREDIENTS,
        pantry: [{ ingredient_id: 'egg', quantity: have / 2, unit: 'each' }],
      });
      const egg = [...list.items, ...list.inPantry].find((i) => i.key === 'i:egg');
      const toBuy = egg?.pantry === 'covered' ? 0 : (egg?.amounts[0]?.quantity ?? 0);
      expect(toBuy).toBe(Math.max(0, Math.ceil(3 - have / 2)));
    }
  });
});

describe('check-off state', () => {
  it('stores keys that look like object internals as ordinary entries', () => {
    const at = '2026-11-11T09:00:00.000Z';
    const keys = ['__proto__', 'constructor', 't:toString'];
    let s = checkReducer(initialCheckState, { type: 'checkAll', keys, at });
    expect(Object.getPrototypeOf(s.checked)).toBe(Object.prototype);
    expect(Object.keys(s.checked).sort()).toEqual([...keys].sort());
    for (const k of keys) expect(isChecked(s, k)).toBe(true);
    s = checkReducer(s, { type: 'toggle', key: '__proto__', at });
    expect(isChecked(s, '__proto__')).toBe(false);
    s = checkReducer(s, { type: 'check', key: '__proto__', at });
    expect(isChecked(s, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(s.checked)).toBe(Object.prototype);
  });

  const at = '2026-11-11T09:00:00.000Z';

  it('toggles, checks and unchecks', () => {
    let s: CheckState = initialCheckState;
    s = checkReducer(s, { type: 'toggle', key: 'i:egg', at });
    expect(isChecked(s, 'i:egg')).toBe(true);
    expect(checkReducer(s, { type: 'check', key: 'i:egg', at })).toBe(s);
    s = checkReducer(s, { type: 'toggle', key: 'i:egg', at });
    expect(isChecked(s, 'i:egg')).toBe(false);
    expect(checkReducer(s, { type: 'uncheck', key: 'i:egg' })).toBe(s);
  });

  it('checks many, clears, and forgets keys no longer listed', () => {
    let s = checkReducer(initialCheckState, { type: 'checkAll', keys: ['a', 'b', 'c'], at });
    expect(Object.keys(s.checked)).toEqual(['a', 'b', 'c']);
    s = checkReducer(s, { type: 'reconcile', keys: ['a', 'c', 'd'] });
    expect(Object.keys(s.checked)).toEqual(['a', 'c']);
    expect(checkReducer(s, { type: 'reconcile', keys: ['a', 'c'] })).toBe(s);
    expect(checkReducer(s, { type: 'clearChecked' })).toEqual(initialCheckState);
  });

  it('reports progress and moves checked items to the end of their aisle', () => {
    const list = buildShoppingList({ recipes: [pancakes], ingredients: INGREDIENTS });
    const s = checkReducer(initialCheckState, { type: 'check', key: 'i:egg', at });
    expect(checkProgress(list.items, s)).toEqual({ done: 1, total: 4 });
    const dairy = orderForDisplay(groupByAisle(list.items), s).find((g) => g.aisle === 'dairy');
    expect(dairy?.items.map((i) => i.key)).toEqual(['i:milk', 'i:egg']);
  });
});

describe('text', () => {
  const list = buildShoppingList({
    recipes: [pancakes, hummusBowl, frittata],
    ingredients: INGREDIENTS,
    pantry: [{ ingredient_id: 'milk', quantity: 100, unit: 'ml' }],
  });

  it('describes items in either system', () => {
    expect(itemText(find(list.items, 'i:egg'), { system: 'us' })).toBe('4 eggs');
    expect(itemText(find(list.items, 'i:flour'), { system: 'metric' })).toBe('200 g flour');
    expect(itemText(find(list.items, 'i:flour'), { system: 'us' })).toBe('7 oz flour');
    expect(itemText(find(list.items, 'i:cumin'), { system: 'us' })).toBe('cumin (as needed)');
    expect(itemText(find(list.items, 'i:milk'), { system: 'us' })).toBe(
      '1 cup milk (some in pantry)', // 1 ¼ cups + 50 ml − 100 ml
    );
  });

  it('exports plain text grouped by aisle, hiding checked items by default', () => {
    const groups = groupByAisle(list.items);
    const checks = checkReducer(initialCheckState, { type: 'check', key: 'i:salt', at: 'T' });
    const text = shoppingListText(groups, { system: 'us', title: 'Famara shopping list', checks });
    expect(text).toBe(
      [
        'Famara shopping list',
        '',
        'Produce\n- 3 cloves garlic\n- 6 2/3 oz onion',
        '',
        'Dairy\n- 4 eggs\n- 1 cup milk (some in pantry)',
        '',
        'Canned\n- 2 cans chickpeas',
        '',
        'Baking\n- 7 oz flour',
        '',
        'Spices\n- cumin (as needed)',
        '',
        'Oils\n- 1/4 cup olive oil',
        '',
        'International foods\n- 6 tbsp tahini',
        '',
        'Other\n- 2 bunches fresh parsley',
      ].join('\n'),
    );
    const withChecked = shoppingListText(groups, { system: 'us', checks, includeChecked: true });
    expect(withChecked).toContain('- [x] 1/2 tsp salt');
  });
});

describe('cost', () => {
  const prices: Record<string, PriceRecord> = {
    flour: { price: 4, packageQty: 2, unit: 'lb', source: 'Store A', fetchedAt: '2026-11-01' },
    egg: { price: 3.6, packageQty: 12, unit: 'each', source: 'Store A', fetchedAt: '2026-11-01' },
    milk: { price: 2, packageQty: 0.5, unit: 'gallon', source: 'Store B', fetchedAt: '2026-08-01' },
    chickpea: {
      price: 1.2,
      packageQty: 1,
      unit: 'can',
      source: 'Store A',
      fetchedAt: '2026-11-01',
    },
    tahini: { price: 6, packageQty: 16, unit: 'oz', source: 'Store B', fetchedAt: '2026-11-01' },
    salt: { price: 1, packageQty: 26, unit: 'oz', source: 'Store A', fetchedAt: '2026-11-01' },
    garlic: { price: 0, packageQty: 0, unit: 'head', source: 'Store A', fetchedAt: '2026-11-01' },
  };
  const now = new Date('2026-11-11T12:00:00Z');

  it('costs the share of each package used', () => {
    const list = buildShoppingList({ recipes: [pancakes], ingredients: INGREDIENTS });
    const est = estimateListCost({ items: list.items, ingredients: INGREDIENTS, prices, now });
    const byKey = new Map(est.items.map((c) => [c.key, c]));
    // 187.5 g of a 907 g bag at $4.
    expect(byKey.get('i:flour')?.cents).toBe(Math.round(400 * (187.5 / 907.18474)));
    expect(byKey.get('i:flour')?.packages).toBe(1);
    expect(byKey.get('i:egg')).toMatchObject({ cents: 30, packages: 1, wholePackageCents: 360 });
    // 1.25 cups of a half gallon (8 cups) at $2.
    expect(byKey.get('i:milk')).toMatchObject({ cents: 31, stale: true, source: 'Store B' });
    expect(byKey.get('i:salt')).toMatchObject({ status: 'staple', cents: 0 });
    expect(est.totalCents).toBe((byKey.get('i:flour')?.cents ?? 0) + 30 + 31);
    expect(est.wholePackageCents).toBe(400 + 360 + 200);
    expect(est.sources).toEqual(['Store A', 'Store B']);
    expect(est.complete).toBe(true);
  });

  it('reports missing, invalid and unconvertible prices', () => {
    const list = buildShoppingList({ recipes: [hummusBowl], ingredients: INGREDIENTS });
    const est = estimateListCost({
      items: list.items,
      ingredients: INGREDIENTS,
      prices: { ...prices, onion: { ...prices.chickpea!, unit: 'lb' }, cumin: prices.salt! },
    });
    const statuses = Object.fromEntries(est.items.map((c) => [c.key, c.status]));
    expect(statuses).toMatchObject({
      'i:chickpea': 'priced',
      'i:tahini': 'unit_mismatch', // tahini has no weight per tablespoon
      'i:garlic': 'invalid_price',
      'i:onion': 'priced',
      'i:cumin': 'no_quantity',
      'i:olive_oil': 'staple',
      't:fresh parsley': 'no_price',
    });
    expect(est.complete).toBe(false);
    expect(est.missing.map((m) => m.key).sort()).toEqual(
      ['i:cumin', 'i:garlic', 'i:tahini', 't:fresh parsley'].sort(),
    );
  });

  it('costs pantry-covered items at zero', () => {
    const list = buildShoppingList({
      recipes: [pancakes],
      ingredients: INGREDIENTS,
      pantry: [{ ingredient_id: 'flour' }],
    });
    const flour = list.inPantry[0] as ShoppingItem;
    expect(costItem(flour, { ingredients: INGREDIENTS, prices })).toMatchObject({
      status: 'in_pantry',
      cents: 0,
    });
  });

  it('estimates a recipe per serving', () => {
    const est = estimateRecipeCost(pancakes, { ingredients: INGREDIENTS, prices });
    expect(est.perServingCents).toBe(Math.round(est.totalCents / 4));
    expect(est.totalCents).toBeGreaterThan(0);
  });

  it('never goes negative and grows with servings (property)', () => {
    let previous = 0;
    for (let servings = 1; servings <= 12; servings += 1) {
      const est = estimateRecipeCost(
        { ...pancakes, plannedServings: servings },
        { ingredients: INGREDIENTS, prices },
      );
      expect(est.totalCents).toBeGreaterThanOrEqual(previous);
      previous = est.totalCents;
    }
  });
});

describe('helpers', () => {
  it('normalises aisles and unmatched line keys', () => {
    expect(normalizeAisle(' Canned Goods ')).toBe('canned_goods');
    expect(normalizeAisle(null)).toBe('other');
    expect(unmatchedKey('2 cups Fresh Basil, torn')).toEqual({
      key: 't:fresh basil',
      name: 'Fresh Basil',
    });
  });
});

describe('review fixes', () => {
  const oneEgg = (recipeId: string): ShoppingRecipe => ({
    recipeId,
    servings: 4,
    plannedServings: 2,
    ingredients: [l('egg', 1, null), l('salt', 0.02, 'tsp')],
  });

  it('rounds each recipe before merging, as the recipe screen does', () => {
    // Each recipe scales to half an egg, which the recipe screen shows as one whole egg.
    const list = buildShoppingList({
      recipes: [oneEgg('a'), oneEgg('b')],
      ingredients: INGREDIENTS,
    });
    expect(find(list.items, 'i:egg').amounts).toEqual([{ quantity: 2, unit: 'each', label: null }]);
    // Minimums are kept per recipe too, capped at the recipe's own amount: 0.02 tsp each, not more.
    expect(find(list.items, 'i:salt').amounts[0]?.quantity).toBeCloseTo(2 * 0.02 * 4.92892, 3);
  });

  it('honours scaled unit aliases', () => {
    const list = buildShoppingList({
      recipes: [
        { recipeId: 'x', servings: 1, plannedServings: 1, ingredients: [l('milk', 5, 'cl')] },
      ],
      ingredients: INGREDIENTS,
    });
    expect(find(list.items, 'i:milk').amounts).toEqual([
      { quantity: expect.closeTo(50, 6), unit: 'ml', label: null },
    ]);
  });

  it('does not treat an unrecognised pantry unit as a count', () => {
    const recipe: ShoppingRecipe = {
      recipeId: 'x',
      servings: 1,
      plannedServings: 1,
      ingredients: [l('onion', 2, null)],
    };
    const list = buildShoppingList({
      recipes: [recipe],
      ingredients: INGREDIENTS,
      pantry: [{ ingredient_id: 'onion', quantity: 2, unit: 'tbsp chopped' }],
    });
    const onion = find(list.items, 'i:onion');
    expect(onion.pantry).toBe('none');
    expect(onion.amounts).toEqual([{ quantity: 2, unit: 'each', label: null }]);
    // A blank unit is a count.
    const blank = buildShoppingList({
      recipes: [recipe],
      ingredients: INGREDIENTS,
      pantry: [{ ingredient_id: 'onion', quantity: 2, unit: ' ' }],
    });
    expect(find(blank.inPantry, 'i:onion').pantry).toBe('covered');
  });

  it('matches an unrecognised pantry unit only against the same unit word', () => {
    const list = buildShoppingList({
      recipes: [
        { recipeId: 'x', servings: 1, plannedServings: 1, ingredients: [l('cumin', 3, 'Shakes')] },
      ],
      ingredients: INGREDIENTS,
      pantry: [{ ingredient_id: 'cumin', quantity: 1, unit: 'shakes' }],
    });
    const cumin = find(list.items, 'i:cumin');
    expect(cumin.pantry).toBe('partial');
    expect(cumin.amounts).toEqual([{ quantity: 2, unit: null, label: 'shakes' }]);
  });

  it('needs real stock left over to cover a "to taste" use', () => {
    const toTaste: ShoppingRecipe = {
      recipeId: 'x',
      servings: 1,
      plannedServings: 1,
      ingredients: [l('cumin', null, null)],
    };
    const empty = buildShoppingList({
      recipes: [toTaste],
      ingredients: INGREDIENTS,
      pantry: [{ ingredient_id: 'cumin', quantity: 0, unit: 'tsp' }],
    });
    const cumin = find(empty.items, 'i:cumin');
    expect(cumin.pantry).toBe('none');
    expect(cumin.asNeeded).toBe(true);

    const stocked = buildShoppingList({
      recipes: [toTaste],
      ingredients: INGREDIENTS,
      pantry: [{ ingredient_id: 'cumin', quantity: 2, unit: 'tsp' }],
    });
    expect(find(stocked.inPantry, 'i:cumin').pantry).toBe('covered');

    // Measured need larger than the stock: nothing is left for the "to taste" use.
    const short = buildShoppingList({
      recipes: [{ ...toTaste, ingredients: [l('cumin', null, null), l('cumin', 2, 'tbsp')] }],
      ingredients: INGREDIENTS,
      pantry: [{ ingredient_id: 'cumin', quantity: 1, unit: 'tbsp' }],
    });
    const shortCumin = find(short.items, 'i:cumin');
    expect(shortCumin.pantry).toBe('partial');
    expect(shortCumin.asNeeded).toBe(true);
    expect(shortCumin.amounts[0]?.quantity).toBeCloseTo(14.7868, 3);
  });
});

describe('half packages from two recipes', () => {
  it('adds ½ can and ½ can up to 1 can', () => {
    const half = (recipeId: string): ShoppingRecipe => ({
      recipeId,
      servings: 2,
      plannedServings: 2,
      ingredients: [l('chickpea', 0.5, 'can')],
    });
    const list = buildShoppingList({
      recipes: [half('r:a'), half('r:b')],
      ingredients: INGREDIENTS,
    });
    expect(find(list.items, 'i:chickpea').amounts).toEqual([
      { quantity: 1, unit: 'can', label: null },
    ]);
  });
});
