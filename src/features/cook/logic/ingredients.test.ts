import type { RecipeIngredientLine } from '@/lib/catalog';

import { cookIngredients, cookSizeFromParams } from './ingredients';

function line(
  position: number,
  text: string,
  quantity: number | null,
  unit: string | null,
): RecipeIngredientLine {
  return {
    position,
    ingredientId: null,
    text,
    quantity,
    unit,
    grams: null,
    section: null,
    optional: false,
  };
}

// Thai-style steamed fish as the catalog stores it.
const steamedFish = [
  line(0, '2 Trout', 2, null),
  line(1, 'Knob Ginger', 1, 'knob'),
  line(2, 'Juice/zest of one Lime', null, null),
  line(3, '3 Baby Pak Koi', 3, null),
  line(4, '2 tblsp Soy Sauce', 2, 'tbsp'),
];

describe('cookIngredients', () => {
  it('splits each line into the amount and name the recipe page shows', () => {
    const out = cookIngredients({
      lines: steamedFish,
      baseServings: 2,
      servings: 2,
      smallAppetite: false,
      system: 'us',
    });
    expect(out.map((i) => [i.amount, i.name])).toEqual([
      ['2', 'Trout'],
      ['1 knob', 'Ginger'],
      [null, 'Juice/zest of one Lime'],
      ['3', 'Baby Pak Koi'],
      ['2 tbsp', 'Soy Sauce'],
    ]);
  });

  it('halves the amounts in small appetite mode, as the recipe page does', () => {
    const out = cookIngredients({
      lines: steamedFish,
      baseServings: 2,
      servings: 2,
      smallAppetite: true,
      system: 'us',
    });
    expect(out.find((i) => i.position === 4)?.amount).toBe('1 tbsp');
  });

  it('writes measured amounts in the chosen unit system', () => {
    const stock = [line(0, '500ml chicken stock', 500, 'ml')];
    const us = cookIngredients({
      lines: stock,
      baseServings: 4,
      servings: 4,
      smallAppetite: false,
      system: 'us',
    });
    const metric = cookIngredients({
      lines: stock,
      baseServings: 4,
      servings: 4,
      smallAppetite: false,
      system: 'metric',
    });
    expect(us[0]?.amount).toBe('2 ⅛ cups');
    expect(metric[0]?.amount).toBe('500 ml');
  });

  it('keeps ticks keyed by the catalog position and reads amount and name together', () => {
    const lines = [{ ...line(7, '1 tsp salt', 1, 'tsp'), optional: true }];
    const [salt] = cookIngredients({
      lines,
      baseServings: 2,
      servings: 2,
      smallAppetite: false,
      system: 'us',
    });
    expect(salt?.position).toBe(7);
    expect(salt?.label).toBe('1 tsp Salt, optional');
  });
});

describe('cookIngredients at the size the recipe page showed', () => {
  it('scales to the servings chosen on the page', () => {
    const [soy] = cookIngredients({
      lines: [line(0, '2 tblsp Soy Sauce', 2, 'tbsp')],
      baseServings: 2,
      servings: 4,
      smallAppetite: false,
      system: 'us',
    });
    expect(soy?.amount).toBe('¼ cup');
  });
});

describe('cookSizeFromParams', () => {
  it('reads the servings and portion the recipe page wrote', () => {
    expect(cookSizeFromParams('4', '1')).toEqual({ servings: 4, halfPortions: false });
    expect(cookSizeFromParams(['2'], '0.5')).toEqual({ servings: 2, halfPortions: true });
  });

  it('leaves out what is missing or malformed, so the recipe and setting decide', () => {
    expect(cookSizeFromParams(undefined, undefined)).toEqual({});
    expect(cookSizeFromParams('0', '2')).toEqual({});
    expect(cookSizeFromParams('21', 'half')).toEqual({});
    expect(cookSizeFromParams('3.5', undefined)).toEqual({});
  });
});
