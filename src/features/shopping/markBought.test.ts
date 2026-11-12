import type { ShoppingItem } from '@/domain/shopping';
import { MAX_PANTRY_ITEMS, addPantryItem, type PantryItem } from '@/stores/pantry';

import { INGREDIENTS, RECIPES, ingredient, line } from './__fixtures__/catalog';
import { buildPlannedList } from './buildList';
import {
  fitIntoPantry,
  markBoughtMessage,
  pantryInputsForExtras,
  pantryInputsForItems,
} from './markBought';
import { linkPantryItems } from './pantryLink';

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
    // The free-text line is matched to its pantry entry by name.
    expect(after.items).toEqual([]);
    expect(after.inPantry.map((i) => i.key).sort()).toEqual(before.items.map((i) => i.key).sort());
  });

  it('clears a catalog line the pantry first held as a free-text item', () => {
    // "egg" typed by hand: no ingredient id, but the list reads it as the catalog egg.
    let items = addPantryItem({}, { name: 'egg', qty: 1 }, { id: 'typed', at });
    const before = listFor(Object.values(items));
    const egg = before.items.find((i) => i.key === 'i:egg') as ShoppingItem;
    expect(egg.amounts.map((a) => a.quantity)).toEqual([3]);

    const pantry = linkPantryItems(Object.values(items), before.catalogNames);
    const { fits } = fitIntoPantry(
      items,
      [{ key: egg.key, inputs: pantryInputsForItems([egg], before.ingredientsById, pantry) }],
      at,
    );
    expect(fits.map((l) => l.key)).toEqual(['i:egg']);
    for (const input of fits.flatMap((l) => l.inputs)) {
      items = addPantryItem(items, input, { id: 'bought', at });
    }
    // The purchase topped up the typed entry, and the rebuilt list no longer asks for eggs.
    expect(Object.values(items)).toEqual([expect.objectContaining({ id: 'typed', qty: 4 })]);
    const after = listFor(Object.values(items));
    expect(after.items.map((i) => i.key)).not.toContain('i:egg');
    expect(after.inPantry.map((i) => i.key)).toContain('i:egg');
  });

  it('tops up a used-up free-text entry for an amount-less catalog line', () => {
    const input = {
      meals: [{ date: '2026-11-12', meal: 'dinner', recipeId: 'test:glaze', servings: 1 }],
      recipes: new Map([
        [
          'test:glaze',
          {
            id: 'test:glaze',
            servings: 1,
            ingredients: [line(1, 'egg', 2, null), line(2, 'egg', null, null, 'egg to glaze')],
          },
        ],
      ]),
      ingredients: INGREDIENTS,
      portion: 1,
    } as const;
    let items = addPantryItem({}, { name: 'Eggs', qty: 2 }, { id: 'typed', at });
    const before = buildPlannedList({ ...input, pantry: Object.values(items) });
    const egg = before.items.find((i) => i.key === 'i:egg') as ShoppingItem;
    expect(egg).toMatchObject({ amounts: [], asNeeded: true });
    const pantry = linkPantryItems(Object.values(items), before.catalogNames);
    for (const bought of pantryInputsForItems([egg], before.ingredientsById, pantry)) {
      items = addPantryItem(items, bought, { id: 'bought', at });
    }
    expect(buildPlannedList({ ...input, pantry: Object.values(items) }).items).toEqual([]);
  });

  it('clears a "to taste" line when the pantry had exactly the measured count', () => {
    const input = {
      meals: [{ date: '2026-11-12', meal: 'dinner', recipeId: 'test:bake', servings: 1 }],
      recipes: new Map([
        [
          'test:bake',
          {
            id: 'test:bake',
            servings: 1,
            ingredients: [line(1, 'egg', 3, null), line(2, 'egg', null, null, 'egg to glaze')],
          },
        ],
      ]),
      ingredients: INGREDIENTS,
      portion: 1,
    } as const;
    let items: Readonly<Record<string, PantryItem>> = addPantryItem(
      {},
      { ingredientId: 'egg', name: 'egg', qty: 3, unit: null, category: 'dairy' },
      { id: 'eggs', at },
    );
    const before = buildPlannedList({ ...input, pantry: Object.values(items) });
    expect(before.items).toEqual([
      expect.objectContaining({ key: 'i:egg', amounts: [], asNeeded: true, pantry: 'partial' }),
    ]);
    const inputs = pantryInputsForItems(before.items, before.ingredientsById, Object.values(items));
    // One more egg on the counted entry, not a "have some" that would leave it as it was.
    expect(inputs).toEqual([expect.objectContaining({ ingredientId: 'egg', qty: 1, unit: null })]);
    const { fits, unchanged } = fitIntoPantry(items, [{ key: 'i:egg', inputs }], at);
    expect(fits.map((l) => l.key)).toEqual(['i:egg']);
    expect(unchanged).toEqual([]);
    for (const next of inputs) items = addPantryItem(items, next, { id: 'new', at });
    expect(Object.values(items)).toEqual([expect.objectContaining({ id: 'eggs', qty: 4 })]);
    expect(buildPlannedList({ ...input, pantry: Object.values(items) }).items).toEqual([]);
  });

  it('tops up a used-up weighed entry by a tenth, at least 1 g', () => {
    const list = {
      key: 'i:salt',
      ingredientId: 'salt',
      name: 'salt',
      plural: null,
      aisle: 'spices',
      amounts: [],
      asNeeded: true,
      recipeIds: ['r'],
      optional: false,
      staple: true,
      pantry: 'partial',
    } as const;
    const pantryWith = (qty: number): PantryItem[] => [
      {
        id: 's',
        ingredientId: 'salt',
        name: 'salt',
        qty,
        unit: 'g',
        category: 'spice',
        addedAt: at,
        expiresAt: null,
      },
    ];
    const qtyFor = (qty: number) =>
      pantryInputsForItems([list], new Map(), pantryWith(qty))[0]?.qty;
    expect(qtyFor(200)).toBe(20);
    expect(qtyFor(4)).toBe(1);
  });

  it('keeps a planned line ticked when buying it would not change the pantry', () => {
    const items = addPantryItem({}, { name: 'fresh coriander' }, { id: 'c', at });
    const lines = [
      { key: 't:fresh coriander', inputs: [{ name: 'fresh coriander' }] },
      { key: 'x:soap', inputs: [{ name: 'fresh coriander' }], leavesList: true },
    ];
    const { fits, unchanged, left } = fitIntoPantry(items, lines, at);
    expect(unchanged.map((l) => l.key)).toEqual(['t:fresh coriander']);
    // A hand-added extra leaves the list anyway: nothing rebuilds it.
    expect(fits.map((l) => l.key)).toEqual(['x:soap']);
    expect(left).toEqual([]);
  });

  it('never reports adding zero items', () => {
    expect(markBoughtMessage(2, 0, 0)).toEqual({
      message: 'Added 2 items to your pantry',
      tone: 'success',
    });
    expect(markBoughtMessage(1, 3, 0).message).toBe('Added 1 item to your pantry');
    expect(markBoughtMessage(0, 1, 0)).toEqual({
      message: expect.not.stringMatching(/Added/),
      tone: 'neutral',
    });
    expect(markBoughtMessage(0, 0, 2).message).toMatch(/^Your pantry is full/);
    expect(markBoughtMessage(1, 0, 2).message).toMatch(/^Added 1 item\. Your pantry is full/);
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
      { key: 'x:a', inputs: [{ name: 'Candles' }], leavesList: true },
      { key: 'x:b', inputs: [{ name: 'thing 3' }], leavesList: true },
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
