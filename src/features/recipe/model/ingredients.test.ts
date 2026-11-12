import {
  buildIngredientRows,
  clampServings,
  formatLineAmount,
  ingredientName,
} from './ingredients';
import { line, makeDetail } from '../test/fixtures';

const lines = makeDetail().ingredients;

function rows(
  overrides: Partial<Parameters<typeof buildIngredientRows>[0]> = {},
): ReturnType<typeof buildIngredientRows> {
  return buildIngredientRows({
    lines,
    baseServings: 4,
    servings: 4,
    smallAppetite: false,
    system: 'us',
    pantry: new Set(),
    ...overrides,
  });
}

describe('ingredientName', () => {
  it('drops the leading amount and unit', () => {
    expect(ingredientName('1 ½ cups rolled oats')).toBe('Rolled oats');
    expect(ingredientName('500g Raw king prawns')).toBe('Raw king prawns');
  });

  it('keeps a package size given with the amount', () => {
    expect(ingredientName('1 (400g) tin Chopped tomatoes')).toBe('Chopped tomatoes (400g)');
    expect(ingredientName('2 (14 oz) cans black beans')).toBe('Black beans (14 oz)');
    expect(ingredientName('2 (200g) chicken breasts')).toBe('Chicken breasts (200g)');
  });

  it('drops a bare leading unit word', () => {
    expect(ingredientName('pinch Freshly chopped parsley')).toBe('Freshly chopped parsley');
  });

  it('keeps lines without an amount whole', () => {
    expect(ingredientName('Salt to taste')).toBe('Salt to taste');
  });
});

describe('buildIngredientRows', () => {
  it('shows the recipe as written at its own servings', () => {
    const { rows: out, factor } = rows();
    expect(factor).toBe(1);
    expect(out.map((r) => r.amount)).toEqual(['2 cups', '1', '2', null]);
    expect(out.map((r) => r.name)).toEqual([
      'Chickpeas',
      'Onion, chopped',
      'Eggs',
      'Salt to taste',
    ]);
  });

  it('scales measured amounts and rounds eggs to whole ones', () => {
    const out = rows({ servings: 2 }).rows;
    expect(out[0]!.amount).toBe('1 cup');
    expect(out[1]!.amount).toBe('½');
    expect(out[2]!.amount).toBe('1');

    const three = rows({ servings: 3 }).rows;
    // 1.5 eggs rounds to a whole egg count, and the row says it was rounded.
    expect(three[2]!.amount).toBe('2');
    expect(three[2]!.rounded).toBe(true);
  });

  it('halves every serving in small appetite mode', () => {
    const built = rows({ smallAppetite: true });
    expect(built.portion).toBe(0.5);
    expect(built.rows[0]!.amount).toBe('1 cup');
  });

  it('converts to metric when the person reads metric', () => {
    const out = rows({ system: 'metric' }).rows;
    expect(out[0]!.amount).toBe('475 ml');
    // Counts stay counts.
    expect(out[2]!.amount).toBe('2');
  });

  it('marks ingredients the person already has', () => {
    const built = rows({ pantry: new Set(['onion', 'salt']) });
    expect(built.rows.map((r) => r.owned)).toEqual([false, true, false, true]);
    expect(built.ownedCount).toBe(2);
  });

  it('keeps stable keys so rows survive re-scaling', () => {
    expect(rows().rows.map((r) => r.key)).toEqual(rows({ servings: 7 }).rows.map((r) => r.key));
  });
});

describe('formatLineAmount', () => {
  it('keeps unit words it cannot convert', () => {
    expect(formatLineAmount({ quantity: 2, unit: null, line: { unit: 'knob' } }, 'metric')).toBe(
      '2 knob',
    );
  });

  it('returns null when there is no amount', () => {
    expect(formatLineAmount({ quantity: null, unit: null, line: { unit: null } }, 'us')).toBeNull();
  });

  it('formats a scaled metric weight', () => {
    const built = buildIngredientRows({
      lines: [line(1, '500g prawns', { ingredientId: 'shrimp', quantity: 500, unit: 'g' })],
      baseServings: 4,
      servings: 6,
      smallAppetite: false,
      system: 'metric',
      pantry: new Set(),
    });
    expect(built.rows[0]!.amount).toBe('750 g');
  });
});

describe('clampServings', () => {
  it('keeps servings within the stepper range', () => {
    expect(clampServings(0)).toBe(1);
    expect(clampServings(99)).toBe(20);
    expect(clampServings(Number.NaN)).toBe(1);
    expect(clampServings(2.6)).toBe(3);
  });
});
