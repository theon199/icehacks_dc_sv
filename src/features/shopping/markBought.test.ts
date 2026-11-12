import type { ShoppingItem } from '@/domain/shopping';
import { MAX_PANTRY_ITEMS, addPantryItem, type PantryItem } from '@/stores/pantry';

import { INGREDIENTS, RECIPES, ingredient, line } from './__fixtures__/catalog';
import { buildPlannedList } from './buildList';
import { fitIntoPantry, pantryInputsForExtras, pantryInputsForItems } from './markBought';

const at = '2026-11-11T10:00:00.000Z';
const meals = [
  { date: '2026-11-12', meal: 'dinner', recipeId: 'test:curry', servings: 2 },
  { date: '2026-11-13', meal: 'dinner', recipeId: 'test:fried-rice', servings: 4 },
] as const;

function listFor(pantry: readonly PantryItem[]) {
  return buildPlannedList({
    meals,
    recipes: RECIPES,
    ingredients: INGREDIENTS,
    pantry,
    portion: 1,
  });
}

function pantryFrom(inputs: ReturnType<typeof pantryInputsForItems>): PantryItem[] {
  let items: Readonly<Record<string, PantryItem>> = {};
  inputs.forEach((input, index) => {
    items = addPantryItem(items, input, { id: `p${index}`, at });
  });
  return Object.values(items);
}

describe('mark bought → pantry', () => {
  it('turns each amount still to buy into a pantry entry on the right shelf', () => {
    const list = listFor([]);
    const rice = list.items.find((i) => i.key === 'i:rice') as ShoppingItem;
    const onion = list.items.find((i) => i.key === 'i:onion') as ShoppingItem;
    expect(pantryInputsForItems([rice, onion], list.ingredientsById)).toEqual([
      { ingredientId: 'rice', name: 'rice', category: 'grain', qty: 600, unit: 'g' },
      // Whole items are a bare count, as the pantry stores "3 onions".
      { ingredientId: 'onion', name: 'onion', category: 'produce', qty: 3, unit: null },
    ]);
  });

  it('records an amount-less item as "have some"', () => {
    const list = listFor([]);
    const salt = list.items.find((i) => i.key === 'i:salt') as ShoppingItem;
    expect(pantryInputsForItems([salt], list.ingredientsById)).toEqual([
      { ingredientId: 'salt', name: 'salt', category: 'spice', qty: null, unit: null },
    ]);
  });

  it('keeps an unrecognised unit word and files unmatched items under Other', () => {
    const list = listFor([]);
    const coriander = list.items.find((i) => i.ingredientId === null) as ShoppingItem;
    expect(pantryInputsForItems([coriander], list.ingredientsById)).toEqual([
      { ingredientId: null, name: 'fresh coriander', category: 'other', qty: 1, unit: 'handful' },
    ]);
  });

  it('empties the list once everything bought is in the pantry', () => {
    const before = listFor([]);
    const pantry = pantryFrom(pantryInputsForItems(before.items, before.ingredientsById));
    const after = listFor(pantry);
    // Every catalog-matched item is now covered; only the free-text line cannot be matched.
    expect(after.items.map((i) => i.key)).toEqual(['t:fresh coriander']);
    expect(after.inPantry.map((i) => i.key).sort()).toEqual(
      before.items
        .filter((i) => i.ingredientId !== null)
        .map((i) => i.key)
        .sort(),
    );
  });

  it('rounds bought amounts up, so no rounding crumb stays on the list', () => {
    const vanilla = ingredient('vanilla_extract', 'baking');
    const input = {
      meals: [{ date: '2026-11-12', meal: 'dinner', recipeId: 'test:cake', servings: 1 }],
      recipes: new Map([
        [
          'test:cake',
          { id: 'test:cake', servings: 1, ingredients: [line(1, vanilla.id, 1, 'tsp')] },
        ],
      ]),
      ingredients: [vanilla],
      portion: 1,
    } as const;
    const before = buildPlannedList({ ...input, pantry: [] });
    expect(before.items[0]?.amounts[0]?.unit).toBe('ml');
    const pantry = pantryFrom(pantryInputsForItems(before.items, before.ingredientsById));
    expect(buildPlannedList({ ...input, pantry }).items).toEqual([]);
  });

  it.each([
    ['a weighed amount', 'salt', 200, 'g'],
    ['a whole count', 'egg', 3, null],
  ] as const)(
    'clears an item used both as %s and "to taste" once it is bought',
    (_label, id, qty, unit) => {
      const input = {
        meals: [{ date: '2026-11-12', meal: 'dinner', recipeId: 'test:mixed', servings: 1 }],
        recipes: new Map([
          [
            'test:mixed',
            {
              id: 'test:mixed',
              servings: 1,
              ingredients: [line(1, id, qty, unit), line(2, id, null, null, `${id} to taste`)],
            },
          ],
        ]),
        ingredients: INGREDIENTS,
        portion: 1,
      } as const;
      const before = buildPlannedList({ ...input, pantry: [] });
      expect(before.items).toEqual([expect.objectContaining({ key: `i:${id}`, asNeeded: true })]);
      const pantry = pantryFrom(pantryInputsForItems(before.items, before.ingredientsById));
      const after = buildPlannedList({ ...input, pantry });
      expect(after.items).toEqual([]);
      expect(after.inPantry.map((i) => i.key)).toEqual([`i:${id}`]);
    },
  );

  it('tops up what was already there instead of adding a second entry', () => {
    let items: Readonly<Record<string, PantryItem>> = {};
    items = addPantryItem(
      items,
      { ingredientId: 'rice', name: 'rice', qty: 250, unit: 'g', category: 'grain' },
      { id: 'existing', at },
    );
    const list = listFor(Object.values(items));
    const rice = list.items.find((i) => i.key === 'i:rice') as ShoppingItem;
    for (const input of pantryInputsForItems([rice], list.ingredientsById)) {
      items = addPantryItem(items, input, { id: 'new', at });
    }
    expect(Object.values(items)).toEqual([expect.objectContaining({ id: 'existing', qty: 600 })]);
  });

  it('keeps lines on the list when the pantry is full, except top-ups', () => {
    let items: Readonly<Record<string, PantryItem>> = {};
    for (let i = 0; i < MAX_PANTRY_ITEMS - 1; i += 1) {
      items = addPantryItem(items, { name: `thing ${i}` }, { id: `t${i}`, at });
    }
    items = addPantryItem(
      items,
      { ingredientId: 'rice', name: 'rice', qty: 100, unit: 'g' },
      { id: 'rice', at },
    );
    const lines = [
      { key: 'i:rice', inputs: [{ ingredientId: 'rice', name: 'rice', qty: 200, unit: 'g' }] },
      { key: 'x:a', inputs: [{ name: 'Candles' }] },
      { key: 'x:b', inputs: [{ name: 'thing 3' }] },
    ];
    const { fits, left } = fitIntoPantry(items, lines, at);
    expect(fits.map((line) => line.key)).toEqual(['i:rice', 'x:b']);
    expect(left.map((line) => line.key)).toEqual(['x:a']);
  });

  it('adds hand-added extras to the Other shelf', () => {
    expect(pantryInputsForExtras([{ id: 'x1', name: 'Dish soap', addedAt: at }])).toEqual([
      { name: 'Dish soap', qty: null, unit: null, category: 'other' },
    ]);
  });
});
