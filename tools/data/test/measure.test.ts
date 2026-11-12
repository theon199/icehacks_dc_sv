import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { measureToGrams, parseMeasure } from '../src/parse/measure.ts';

const close = (actual: number | null, expected: number, tolerance = 0.01) => {
  assert.ok(actual !== null, `expected ~${expected}, got null`);
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `expected ~${expected}, got ${actual}`);
};

describe('parseMeasure', () => {
  it('reads mixed fractions with a volume unit', () => {
    const m = parseMeasure('1 1/2 cups');
    assert.equal(m.quantity, 1.5);
    assert.equal(m.unit, 'cup');
  });

  it('reads metric weights written without a space', () => {
    const m = parseMeasure('200g');
    assert.equal(m.quantity, 200);
    assert.equal(m.unit, 'g');
    assert.equal(m.grams, 200);
  });

  it('reads abbreviations like tbs and tsp', () => {
    assert.equal(parseMeasure('2 tbs').unit, 'tbsp');
    assert.equal(parseMeasure('1/2 tsp').unit, 'tsp');
    assert.equal(parseMeasure('3 Tblsp').unit, 'tbsp');
    assert.equal(parseMeasure('1 T').unit, 'tbsp');
  });

  it('reads unicode fractions', () => {
    close(parseMeasure('½ cup').quantity, 0.5);
    close(parseMeasure('1½ tsp').quantity, 1.5);
    close(parseMeasure('¾ lb').grams, 340.19);
  });

  it('treats pinch and dash as tiny amounts', () => {
    const m = parseMeasure('pinch');
    assert.equal(m.unit, 'pinch');
    assert.equal(m.quantity, 1);
    close(measureToGrams(m, { tsp: 2.5 }), 0.156);
  });

  it('flags "to taste" style measures as unquantified', () => {
    assert.equal(parseMeasure('to taste').unquantified, true);
    assert.equal(parseMeasure('For frying').unquantified, true);
    assert.equal(parseMeasure('Garnish').unquantified, true);
    assert.equal(parseMeasure('').unquantified, true);
  });

  it('averages ranges', () => {
    assert.equal(parseMeasure('2-3 cloves').quantity, 2.5);
    assert.equal(parseMeasure('2 to 4 tbsp').quantity, 3);
  });

  it('reads package sizes', () => {
    const can = parseMeasure('1 x 400g tin');
    assert.equal(can.unit, 'can');
    assert.equal(can.grams, 400);
    const cans = parseMeasure('2 (14.5 ounce) cans diced tomatoes');
    assert.equal(cans.unit, 'can');
    close(cans.grams, 822.1);
    assert.equal(cans.rest, 'diced tomatoes');
  });

  it('keeps the words after the measure', () => {
    const m = parseMeasure('3/4 pound lean ground beef');
    close(m.grams, 340.19);
    assert.equal(m.rest, 'lean ground beef');
    assert.equal(parseMeasure('1/4teaspoon ground ginger').rest, 'ground ginger');
  });

  it('reads size words for count ingredients', () => {
    const m = parseMeasure('2 large');
    assert.equal(m.quantity, 2);
    assert.equal(m.size, 'large');
    assert.equal(m.unit, null);
  });

  it('drops an alternative measure after the first', () => {
    const m = parseMeasure('175g/6oz');
    assert.equal(m.grams, 175);
    assert.equal(m.rest, '');
  });

  it('reads word numbers', () => {
    const m = parseMeasure('two cloves garlic');
    assert.equal(m.quantity, 2);
    assert.equal(m.unit, 'clove');
    assert.equal(m.rest, 'garlic');
  });

  it('does not read the start of a word as a unit', () => {
    const m = parseMeasure('1 large onion');
    assert.equal(m.unit, null);
    assert.equal(m.rest, 'onion');
  });
});

describe('measureToGrams', () => {
  const onion = { medium: 110, large: 150, small: 70, cup: 160 };

  it('uses piece weights by size for counted items', () => {
    assert.equal(measureToGrams(parseMeasure('2 large'), onion), 300);
    assert.equal(measureToGrams(parseMeasure('1'), onion), 110);
  });

  it('converts volume via the cup weight', () => {
    close(measureToGrams(parseMeasure('2 tbsp'), onion), 20);
  });

  it('returns null when the amount is not known', () => {
    assert.equal(measureToGrams(parseMeasure('to taste'), onion), null);
  });
});
