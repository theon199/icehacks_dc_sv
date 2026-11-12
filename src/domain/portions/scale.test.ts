import {
  defaultDivisibility,
  halfPortion,
  scaleLines,
  scaleNutrition,
  scaleRecipe,
  type PortionLine,
  type PortionRecipe,
} from './index';

function line(
  ingredient_id: string | null,
  quantity: number | null,
  unit: string | null,
  grams: number | null = null,
): PortionLine {
  return {
    ingredient_id,
    text: `${quantity ?? ''} ${unit ?? ''} ${ingredient_id ?? ''}`,
    quantity,
    unit,
    grams,
  };
}

const frittata: PortionRecipe = {
  servings: 4,
  ingredients: [
    line('egg', 6, null, 300),
    line('tortilla', 4, 'each', 180),
    line('onion', 1, null, 110),
    line('milk', 0.5, 'cup', 120),
    line('salt', 0.25, 'tsp', 1.5),
    line('garlic', 2, 'cloves', 6),
    line('black_pepper', null, null),
  ],
};

function quantities(recipe: ReturnType<typeof scaleRecipe>) {
  return recipe.lines.map((l) => l.quantity);
}

describe('scaleRecipe', () => {
  it('returns the original amounts at the original serving count', () => {
    expect(quantities(scaleRecipe(frittata, 4))).toEqual([6, 4, 1, 0.5, 0.25, 2, null]);
  });

  it('scales measured ingredients linearly', () => {
    const doubled = scaleRecipe(frittata, 8);
    expect(doubled.factor).toBe(2);
    expect(doubled.lines[3]?.quantity).toBe(1);
    expect(doubled.lines[3]?.grams).toBe(240);
    expect(doubled.lines[4]?.quantity).toBe(0.5);
  });

  it('rounds whole items to whole numbers and never to zero', () => {
    const one = scaleRecipe(frittata, 1);
    expect(one.lines[0]?.quantity).toBe(2); // 1.5 eggs → 2
    expect(one.lines[1]?.quantity).toBe(1); // 1 tortilla
    expect(one.lines[5]?.quantity).toBe(1); // 0.5 clove → 1
    const tiny = scaleRecipe({ servings: 12, ingredients: [line('egg', 2, null)] }, 1);
    expect(tiny.lines[0]?.quantity).toBe(1);
    expect(tiny.lines[0]?.adjusted).toBe(true);
  });

  it('lets halvable produce land on halves', () => {
    const one = scaleRecipe(frittata, 2);
    expect(one.lines[2]?.quantity).toBe(0.5);
    const three = scaleRecipe(frittata, 6);
    expect(three.lines[2]?.quantity).toBe(1.5);
  });

  it('holds measured amounts at a usable minimum', () => {
    const shrunk = scaleRecipe({ servings: 8, ingredients: [line('salt', 0.25, 'tsp')] }, 1);
    expect(shrunk.lines[0]?.quantity).toBeCloseTo(1 / 8, 10);
    expect(shrunk.lines[0]?.adjusted).toBe(true);
    const grams = scaleRecipe({ servings: 10, ingredients: [line('saffron', 2, 'g')] }, 1);
    expect(grams.lines[0]?.quantity).toBe(1);
  });

  it('keeps grams proportional to the rounded quantity', () => {
    const one = scaleRecipe(frittata, 1);
    expect(one.lines[0]?.grams).toBeCloseTo((300 * 2) / 6, 10);
    expect(one.lines[0]?.exactQuantity).toBe(1.5);
  });

  it('leaves unquantified lines as they are', () => {
    const one = scaleRecipe(frittata, 1);
    expect(one.lines[6]).toMatchObject({ quantity: null, exactQuantity: null, adjusted: false });
  });

  it('falls back to the base serving count for invalid targets', () => {
    expect(scaleRecipe(frittata, 0).factor).toBe(1);
    expect(scaleRecipe(frittata, Number.NaN).factor).toBe(1);
    expect(scaleRecipe({ servings: 0, ingredients: [] }, 2).factor).toBe(2);
  });

  it('accepts a custom divisibility rule', () => {
    const scaled = scaleRecipe(frittata, 1, { divisibility: () => 'free' });
    expect(scaled.lines[0]?.quantity).toBe(1.5);
  });

  it('never produces non-positive quantities for positive input (property)', () => {
    for (let target = 1; target <= 12; target += 1) {
      for (const small of [false, true]) {
        for (const l of scaleRecipe(frittata, target, { smallAppetite: small }).lines) {
          if (l.quantity !== null) expect(l.quantity).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('small appetite', () => {
  it('halves each serving', () => {
    const half = halfPortion(frittata);
    expect(half.portion).toBe(0.5);
    expect(half.servings).toBe(4);
    expect(half.factor).toBe(0.5);
    expect(quantities(half)).toEqual([3, 2, 0.5, 0.25, 0.125, 1, null]);
  });

  it('two small servings match one standard serving', () => {
    const small = scaleRecipe(frittata, 2, { smallAppetite: true });
    const standard = scaleRecipe(frittata, 1);
    expect(quantities(small)).toEqual(quantities(standard));
  });
});

describe('defaultDivisibility', () => {
  it.each<[string | null, string | null, string]>([
    ['egg', null, 'whole'],
    ['eggs', 'each', 'whole'],
    ['large_egg', 'each', 'whole'],
    ['corn_tortilla', 'each', 'whole'],
    ['burger_bun', 'each', 'whole'],
    ['onion', 'each', 'half'],
    ['avocado', null, 'half'],
    ['eggplant', 'each', 'half'],
    ['chickpea', 'can', 'whole'],
    ['flour', 'cup', 'free'],
    ['rice', 'g', 'free'],
  ])('%s in %s is %s', (id, unit, expected) => {
    expect(
      defaultDivisibility(
        id,
        unit === null ? null : (unit as Parameters<typeof defaultDivisibility>[1]),
      ),
    ).toBe(expected);
  });
});

describe('scaleNutrition', () => {
  it('scales present values and keeps missing ones null', () => {
    expect(scaleNutrition({ kcal: 400, protein_g: 20, sodium_mg: null }, 0.5)).toEqual({
      kcal: 200,
      protein_g: 10,
      sodium_mg: null,
    });
  });
});

describe('scaled unit spellings', () => {
  it('applies the multiplier of a scaled unit alias such as cl', () => {
    const r: PortionRecipe = { servings: 2, ingredients: [line('wine', 5, 'cl', 50)] };
    const same = scaleRecipe(r, 2).lines[0];
    expect(same?.unit).toBe('ml');
    expect(same?.quantity).toBeCloseTo(50, 10);
    expect(same?.grams).toBeCloseTo(50, 10);
    expect(same?.adjusted).toBe(false);
    expect(scaleRecipe(r, 4).lines[0]?.quantity).toBeCloseTo(100, 10);
  });
});

describe('scaleLines', () => {
  it('rounds like scaleRecipe for the same factor', () => {
    const viaLines = scaleLines(frittata.ingredients, 0.25);
    expect(viaLines.map((l) => l.quantity)).toEqual(quantities(scaleRecipe(frittata, 1)));
  });
});

describe('measured minimums never exceed the recipe', () => {
  const measuredUnits = ['pinch', 'dash', 'tsp', 'tbsp', 'cup', 'ml', 'l', 'g', 'kg', 'oz', 'lb'];
  const amounts = [0.01, 0.02, 0.1, 0.25, 0.5, 1, 1.5, 3, 250];

  it('returns every line unchanged at factor 1 (property)', () => {
    const lines: PortionLine[] = [];
    for (const unit of measuredUnits) {
      for (const q of amounts) lines.push(line('spice', q, unit, q * 2));
    }
    // Counted lines already on their rounding step, and lines with a unit word we do not know.
    lines.push(line('egg', 3, null), line('onion', 1.5, null), line('garlic', 2, 'cloves'));
    lines.push(line('flour', 1.3, 'heaping cup'), line('water', 0.2, 'splash of'));
    for (const scaled of scaleLines(lines, 1)) {
      expect(scaled.quantity).toBe(scaled.line.quantity);
      expect(scaled.grams).toBe(scaled.line.grams);
      expect(scaled.adjusted).toBe(false);
    }
  });

  it('never scales a measured line down to more than its original amount (property)', () => {
    for (const unit of measuredUnits) {
      for (const q of amounts) {
        for (const factor of [0.05, 0.125, 0.25, 0.5, 0.75, 1]) {
          const [scaled] = scaleLines([line('spice', q, unit)], factor);
          expect(scaled?.quantity).toBeGreaterThan(0);
          expect(scaled?.quantity).toBeLessThanOrEqual(q);
        }
      }
    }
  });

  it('keeps a pinch a pinch', () => {
    const recipe: PortionRecipe = { servings: 4, ingredients: [line('salt', 1, 'pinch')] };
    expect(scaleRecipe(recipe, 4).lines[0]).toMatchObject({ quantity: 1, adjusted: false });
    expect(scaleRecipe(recipe, 1).lines[0]?.quantity).toBe(1);
    expect(scaleRecipe(recipe, 8).lines[0]?.quantity).toBe(2);
  });

  it('keeps sub-gram amounts at their own size', () => {
    const recipe: PortionRecipe = { servings: 4, ingredients: [line('saffron', 0.5, 'g')] };
    expect(scaleRecipe(recipe, 4).lines[0]?.quantity).toBe(0.5);
    expect(scaleRecipe(recipe, 1).lines[0]?.quantity).toBe(0.5);
    expect(scaleRecipe(recipe, 1).lines[0]?.adjusted).toBe(true);
  });

  it('still lifts larger amounts to the usual minimum when scaled down', () => {
    const [salt] = scaleLines([line('salt', 0.5, 'tsp')], 0.1);
    expect(salt?.quantity).toBeCloseTo(1 / 8, 10);
    const [yeast] = scaleLines([line('yeast', 7, 'g')], 0.1);
    expect(yeast?.quantity).toBe(1);
  });
});

describe('unrecognised unit words', () => {
  it('keeps the exact amount instead of rounding it as a count', () => {
    const [flour] = scaleLines([line('flour', 1, 'heaping cup', 140)], 0.25);
    expect(flour).toMatchObject({ quantity: 0.25, unit: null, exactQuantity: 0.25, adjusted: false });
    expect(flour?.grams).toBeCloseTo(35, 10);
  });

  it('still rounds lines with no unit at all as counts', () => {
    const [egg] = scaleLines([line('egg', 1, '  ')], 0.25);
    expect(egg?.quantity).toBe(1);
  });
});
