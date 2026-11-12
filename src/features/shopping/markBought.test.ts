import type { ShoppingItem } from '@/domain/shopping';
import { addPantryItem, type PantryItem } from '@/stores/pantry';

import { INGREDIENTS, RECIPES, ingredient, line } from './__fixtures__/catalog';
import { buildPlannedList } from './buildList';
import { pantryInputsForExtras, pantryInputsForItems } from './markBought';

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

  it('adds hand-added extras to the Other shelf', () => {
    expect(pantryInputsForExtras([{ id: 'x1', name: 'Dish soap', addedAt: at }])).toEqual([
      { name: 'Dish soap', qty: null, unit: null, category: 'other' },
    ]);
  });
});
