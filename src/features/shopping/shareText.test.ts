import type { ShoppingCheck } from '@/stores/shopping';

import { INGREDIENTS, RECIPES, pantryItem } from './__fixtures__/catalog';
import { buildPlannedList } from './buildList';
import { extraKey } from './extrasStore';
import { shoppingRows } from './rows';
import { shoppingShareText, toCheckState } from './shareText';

const at = '2026-11-11T10:00:00.000Z';
const list = buildPlannedList({
  meals: [
    { date: '2026-11-12', meal: 'dinner', recipeId: 'test:curry', servings: 2 },
    { date: '2026-11-13', meal: 'dinner', recipeId: 'test:fried-rice', servings: 4 },
  ],
  recipes: RECIPES,
  ingredients: INGREDIENTS,
  pantry: [pantryItem('p', 'egg', 12)],
  portion: 1,
});
const extras = [
  { id: 'a', name: 'Dish soap', addedAt: at },
  { id: 'b', name: 'Candles', addedAt: at },
];
const checks = (...keys: string[]): Record<string, ShoppingCheck> =>
  Object.fromEntries(keys.map((key) => [key, { key, checkedAt: at }]));

describe('sharing the list as text', () => {
  it('lists what is left to buy by aisle, then the extras, leaving out ticked lines', () => {
    const text = shoppingShareText({
      title: 'Shopping list',
      groups: list.groups,
      extras,
      checked: checks('i:rice', extraKey('b')),
      system: 'metric',
    });
    expect(text).toBe(
      [
        'Shopping list',
        'Produce\n- 3 onions',
        'Meat & seafood\n- 500 g chicken breast',
        'Cans & jars\n- 1 can chickpea',
        'Herbs & spices\n- salt (as needed)',
        'Everything else\n- 1 handful fresh coriander',
        'Added by you\n- Dish soap',
      ].join('\n\n'),
    );
  });

  it('has nothing to share once everything is ticked', () => {
    const everything = [...list.items.map((i) => i.key), ...extras.map((e) => extraKey(e.id))];
    expect(
      shoppingShareText({
        title: 'Shopping list',
        groups: list.groups,
        extras,
        checked: checks(...everything),
        system: 'us',
      }),
    ).toBeNull();
  });
});

describe('screen rows', () => {
  const rowsFor = (keys: string[], showPantry = false) =>
    shoppingRows({
      groups: list.groups,
      inPantry: list.inPantry,
      extras,
      checks: toCheckState(checks(...keys)),
      system: 'us',
      showPantry,
    });

  it('heads each aisle and sinks ticked items to the bottom of it', () => {
    const extrasRows = rowsFor([extraKey('a')]).filter(
      (row) => row.type === 'check' && row.key.startsWith('x:'),
    );
    expect(extrasRows.map((row) => row.type === 'check' && [row.title, row.checked])).toEqual([
      ['Candles', false],
      ['Dish soap', true],
    ]);
  });

  it('notes items shared between recipes', () => {
    const onion = rowsFor([]).find((row) => row.key === 'i:onion');
    expect(onion).toMatchObject({ title: '3 onions', subtitle: 'For 2 recipes', checked: false });
  });

  it('collapses the pantry-covered items until asked', () => {
    expect(rowsFor([]).filter((row) => row.type === 'pantryItem')).toEqual([]);
    expect(rowsFor([]).find((row) => row.type === 'pantryToggle')).toMatchObject({ count: 1 });
    expect(rowsFor([], true).filter((row) => row.type === 'pantryItem')).toEqual([
      { type: 'pantryItem', key: 'pantry:i:egg', title: '4 eggs' },
    ]);
  });
});
