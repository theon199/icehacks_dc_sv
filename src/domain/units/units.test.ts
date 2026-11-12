import {
  canExpressIn,
  convertAmount,
  convertUnit,
  densityOf,
  formatAmount,
  formatIn,
  formatQuantity,
  fromGrams,
  normalizeGramsPerUnit,
  normalizeUnit,
  parseAmount,
  parseQuantity,
  roundMetric,
  snappedValue,
  toDisplayUnit,
  toGrams,
  UNITS,
  unitLabel,
  type UnitId,
} from './index';

/** Small seeded generator so property-style tests are reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('normalizeUnit', () => {
  it.each([
    ['Tablespoons', 'tbsp'],
    ['tbsp.', 'tbsp'],
    ['T', 'tbsp'],
    ['t', 'tsp'],
    ['TSP', 'tsp'],
    ['cups', 'cup'],
    ['fl oz', 'fl_oz'],
    ['Fluid  Ounces', 'fl_oz'],
    ['lbs', 'lb'],
    ['grams', 'g'],
    ['Litres', 'l'],
    ['cloves', 'clove'],
    ['pieces', 'each'],
    ['tins', 'can'],
  ])('maps %s to %s', (raw, unit) => {
    expect(normalizeUnit(raw)).toBe(unit);
  });

  it('returns null for unknown words and empty input', () => {
    expect(normalizeUnit('handful-ish')).toBeNull();
    expect(normalizeUnit('')).toBeNull();
    expect(normalizeUnit(null)).toBeNull();
    expect(normalizeUnit(undefined)).toBeNull();
  });

  it('labels plural units only above one', () => {
    expect(unitLabel('cup', 1)).toBe('cup');
    expect(unitLabel('cup', 1.5)).toBe('cups');
    expect(unitLabel('each', 3)).toBe('');
  });
});

describe('convertUnit', () => {
  it('converts US volumes exactly', () => {
    expect(convertUnit(1, 'cup', 'tbsp')).toBeCloseTo(16, 10);
    expect(convertUnit(1, 'tbsp', 'tsp')).toBeCloseTo(3, 10);
    expect(convertUnit(1, 'gallon', 'cup')).toBeCloseTo(16, 10);
    expect(convertUnit(1, 'cup', 'ml')).toBeCloseTo(236.588, 3);
  });

  it('converts mass between systems', () => {
    expect(convertUnit(1, 'lb', 'oz')).toBeCloseTo(16, 10);
    expect(convertUnit(1, 'lb', 'g')).toBeCloseTo(453.592, 3);
    expect(convertUnit(2.5, 'kg', 'g')).toBe(2500);
  });

  it('refuses cross-dimension and count conversions', () => {
    expect(convertUnit(1, 'cup', 'g')).toBeNull();
    expect(convertUnit(1, 'can', 'clove')).toBeNull();
    expect(convertUnit(3, 'clove', 'clove')).toBe(3);
    expect(convertUnit(Number.NaN, 'cup', 'ml')).toBeNull();
  });

  it('round-trips through any same-dimension unit (property)', () => {
    const next = rng(7);
    const volume = (Object.keys(UNITS) as UnitId[]).filter((u) => UNITS[u].dimension === 'volume');
    const mass = (Object.keys(UNITS) as UnitId[]).filter((u) => UNITS[u].dimension === 'mass');
    for (let i = 0; i < 300; i += 1) {
      const group = next() < 0.5 ? volume : mass;
      const a = group[Math.floor(next() * group.length)] as UnitId;
      const b = group[Math.floor(next() * group.length)] as UnitId;
      const q = next() * 1000;
      const there = convertUnit(q, a, b);
      expect(there).not.toBeNull();
      expect(convertUnit(there as number, b, a)).toBeCloseTo(q, 6);
    }
  });
});

describe('ingredient-aware conversions', () => {
  const flour = normalizeGramsPerUnit({ cup: 125, Tablespoon: 8 });
  const egg = normalizeGramsPerUnit({ each: 50, large: 56 });
  const garlic = normalizeGramsPerUnit({ clove: 3, head: 40 });

  it('normalises keys and drops unusable weights', () => {
    expect(normalizeGramsPerUnit({ cups: 120, bogus: 3, tsp: -1, g: Number.NaN })).toEqual({
      cup: 120,
    });
    expect(normalizeGramsPerUnit(null)).toEqual({});
    expect(normalizeGramsPerUnit({ cl: 10 })).toEqual({ ml: 1 });
  });

  it('uses a direct weight when one is listed', () => {
    expect(toGrams(2, 'cup', flour)).toBe(250);
    expect(toGrams(1, 'tbsp', flour)).toBe(8);
    expect(toGrams(3, 'each', egg)).toBe(150);
  });

  it('derives a density for volumes that are not listed', () => {
    expect(densityOf(flour)).toBeCloseTo(125 / 236.588, 5);
    expect(toGrams(1, 'tsp', flour)).toBeCloseTo(125 / 48, 3);
    expect(toGrams(500, 'ml', flour)).toBeCloseTo((500 * 125) / 236.588, 3);
  });

  it('returns null when the ingredient has no weight for the unit', () => {
    expect(toGrams(1, 'cup', egg)).toBeNull();
    expect(toGrams(1, 'clove', flour)).toBeNull();
    expect(toGrams(1, 'cup')).toBeNull();
    expect(toGrams(200, 'g')).toBe(200);
  });

  it('converts volume to mass and back', () => {
    expect(convertAmount(1, 'cup', 'g', flour)).toBe(125);
    expect(convertAmount(250, 'g', 'cup', flour)).toBeCloseTo(2, 10);
    expect(convertAmount(1, 'lb', 'cup', flour)).toBeCloseTo(453.592 / 125, 3);
    expect(fromGrams(100, 'each', egg)).toBe(2);
  });

  it('converts between two count units through weight', () => {
    expect(convertAmount(1, 'head', 'clove', garlic)).toBeCloseTo(40 / 3, 10);
    expect(convertAmount(1, 'head', 'clove')).toBeNull();
  });

  it('reports which dimensions an amount can be expressed in', () => {
    expect(canExpressIn('cup', 'mass', flour)).toBe(true);
    expect(canExpressIn('cup', 'mass', egg)).toBe(false);
    expect(canExpressIn('g', 'volume', flour)).toBe(true);
    expect(canExpressIn('each', 'volume', egg)).toBe(false);
    expect(canExpressIn('each', 'count', egg)).toBe(false);
  });
});

describe('parseQuantity', () => {
  it.each<[string, number, number | undefined]>([
    ['2', 2, undefined],
    ['1.5', 1.5, undefined],
    ['1,5', 1.5, undefined],
    ['.5', 0.5, undefined],
    ['3/4', 0.75, undefined],
    ['1 1/2', 1.5, undefined],
    ['1-1/2', 1.5, undefined],
    ['1½', 1.5, undefined],
    ['1 ½', 1.5, undefined],
    ['⅓', 1 / 3, undefined],
    ['2-3', 2, 3],
    ['2 – 3', 2, 3],
    ['2 to 3', 2, 3],
    ['1 or 2', 1, 2],
    ['a', 1, undefined],
  ])('parses %s', (text, value, max) => {
    const parsed = parseQuantity(text);
    expect(parsed?.value).toBeCloseTo(value, 10);
    expect(parsed?.max).toBe(max);
  });

  it('rejects text that is not a quantity', () => {
    expect(parseQuantity('to taste')).toBeNull();
    expect(parseQuantity('2 cups')).toBeNull();
    expect(parseQuantity('1/0')).toBeNull();
    expect(parseQuantity('')).toBeNull();
    expect(parseQuantity(null)).toBeNull();
  });
});

describe('parseAmount', () => {
  it('splits quantity, unit and ingredient', () => {
    expect(parseAmount('1 ½ cups rolled oats')).toEqual({
      quantity: { value: 1.5 },
      unit: 'cup',
      rest: 'rolled oats',
    });
    expect(parseAmount('2 fl oz lime juice')).toEqual({
      quantity: { value: 2 },
      unit: 'fl_oz',
      rest: 'lime juice',
    });
    expect(parseAmount('a pinch of salt')).toEqual({
      quantity: { value: 1 },
      unit: 'pinch',
      rest: 'salt',
    });
  });

  it('skips a package-size note before the unit', () => {
    expect(parseAmount('1 (14 oz) can chickpeas')).toEqual({
      quantity: { value: 1 },
      unit: 'can',
      rest: 'chickpeas',
    });
  });

  it('keeps unitless counts and descriptive words in the rest', () => {
    expect(parseAmount('3 large eggs')).toEqual({
      quantity: { value: 3 },
      unit: null,
      rest: 'large eggs',
    });
    expect(parseAmount('2-3 tbsp olive oil')).toEqual({
      quantity: { value: 2, max: 3 },
      unit: 'tbsp',
      rest: 'olive oil',
    });
  });

  it('scales centilitres into millilitres', () => {
    expect(parseAmount('5 cl rum')).toEqual({ quantity: { value: 50 }, unit: 'ml', rest: 'rum' });
  });

  it('leaves lines without a quantity whole', () => {
    expect(parseAmount('Salt and pepper to taste')).toEqual({
      quantity: null,
      unit: null,
      rest: 'Salt and pepper to taste',
    });
  });
});

describe('formatQuantity', () => {
  it.each<[number, string]>([
    [0.5, '½'],
    [0.25, '¼'],
    [0.33, '⅓'],
    [0.7, '⅔'],
    [1.5, '1 ½'],
    [2, '2'],
    [2.97, '3'],
    [0.01, '⅛'],
    [10.3, '10 ½'],
    [12.1, '12'],
    [24.6, '25'],
  ])('renders %d in US mode as %s', (value, text) => {
    expect(formatQuantity(value, { system: 'us' })).toBe(text);
  });

  it('renders ASCII fractions for plain text', () => {
    expect(formatQuantity(1.25, { system: 'us', fractionStyle: 'ascii' })).toBe('1 1/4');
    expect(formatQuantity(0.5, { system: 'us', fractionStyle: 'ascii' })).toBe('1/2');
  });

  it.each<[number, string]>([
    [0.254, '0.25'],
    [2.46, '2.5'],
    [47.3, '47'],
    [236.6, '235'],
    [1234, '1230'],
    [5, '5'],
  ])('renders %d in metric mode as %s', (value, text) => {
    expect(formatQuantity(value, { system: 'metric' })).toBe(text);
  });

  it('snaps every positive value under ten to within an eighth (property)', () => {
    const next = rng(11);
    for (let i = 0; i < 500; i += 1) {
      const v = 0.07 + next() * 9.9;
      expect(Math.abs(snappedValue(v) - v)).toBeLessThanOrEqual(1 / 8 + 1e-9);
      expect(snappedValue(v)).toBeGreaterThan(0);
    }
  });

  it('keeps metric rounding within 5% (property)', () => {
    const next = rng(5);
    for (let i = 0; i < 500; i += 1) {
      const v = 0.05 + next() * 5000;
      expect(Math.abs(roundMetric(v) - v) / v).toBeLessThanOrEqual(0.05);
    }
  });
});

describe('display units', () => {
  it('climbs the US volume ladder', () => {
    expect(toDisplayUnit(3, 'tsp', 'us')).toEqual({
      quantity: expect.closeTo(1, 10),
      unit: 'tbsp',
    });
    expect(toDisplayUnit(8, 'tbsp', 'us').unit).toBe('cup');
    expect(toDisplayUnit(6, 'tbsp', 'us').unit).toBe('tbsp');
    expect(toDisplayUnit(4, 'tbsp', 'us').unit).toBe('cup');
    expect(toDisplayUnit(2, 'tsp', 'us').unit).toBe('tsp');
    expect(toDisplayUnit(20, 'cup', 'us').unit).toBe('gallon');
    expect(toDisplayUnit(500, 'ml', 'us').unit).toBe('cup');
  });

  it('keeps small spoons in metric and switches to litres for large volumes', () => {
    expect(toDisplayUnit(2, 'tbsp', 'metric').unit).toBe('tbsp');
    expect(toDisplayUnit(2, 'tsp', 'metric').unit).toBe('tsp');
    expect(toDisplayUnit(1, 'cup', 'metric').unit).toBe('ml');
    expect(toDisplayUnit(1500, 'ml', 'metric')).toEqual({ quantity: 1.5, unit: 'l' });
  });

  it('chooses readable mass units', () => {
    expect(toDisplayUnit(500, 'g', 'us').unit).toBe('lb');
    expect(toDisplayUnit(100, 'g', 'us').unit).toBe('oz');
    expect(toDisplayUnit(2, 'lb', 'metric').unit).toBe('g');
    expect(toDisplayUnit(3, 'lb', 'metric').unit).toBe('kg');
  });

  it('leaves counts and pinches alone', () => {
    expect(toDisplayUnit(2, 'clove', 'metric')).toEqual({ quantity: 2, unit: 'clove' });
    expect(toDisplayUnit(1, 'pinch', 'us')).toEqual({ quantity: 1, unit: 'pinch' });
  });

  it('formats amounts for each system', () => {
    expect(formatAmount(1.5, 'cup', { system: 'us' })).toBe('1 ½ cups');
    expect(formatAmount(1, 'cup', { system: 'us' })).toBe('1 cup');
    expect(formatAmount(1, 'cup', { system: 'metric' })).toBe('235 ml');
    expect(formatAmount(1.5, 'tsp', { system: 'metric' })).toBe('1 ½ tsp');
    expect(formatAmount(250, 'g', { system: 'metric' })).toBe('250 g');
    expect(formatAmount(1250, 'g', { system: 'metric' })).toBe('1.25 kg');
    expect(formatAmount(3, 'each', { system: 'us' })).toBe('3');
    expect(formatAmount(2, 'clove', { system: 'metric' })).toBe('2 cloves');
    expect(formatAmount(0.5, 'cup', { system: 'us', fractionStyle: 'ascii' })).toBe('1/2 cup');
  });

  it('formats in an explicit unit', () => {
    expect(formatIn(2, 'cup', 'ml', { system: 'metric' })).toBe('475 ml');
    expect(formatIn(1, 'cup', 'g', { system: 'metric' })).toBeNull();
  });
});
