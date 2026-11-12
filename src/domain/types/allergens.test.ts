import {
  ALLERGEN_IDS,
  allergenMapJsonSchema,
  allergenMapSchema,
  isAllergenId,
  unknownAllergenMap,
} from './allergens';

describe('allergen map parsing', () => {
  it('keeps reported statuses', () => {
    const parsed = allergenMapSchema.parse({ peanut: 'contains', milk: 'free', egg: 'unknown' });
    expect(parsed.peanut).toBe('contains');
    expect(parsed.milk).toBe('free');
    expect(parsed.egg).toBe('unknown');
  });

  it('treats allergens the catalog did not report as unknown', () => {
    const parsed = allergenMapSchema.parse({ milk: 'free' });
    for (const id of ALLERGEN_IDS) {
      if (id !== 'milk') expect(parsed[id]).toBe('unknown');
    }
  });

  it('ignores allergens this build does not know', () => {
    const parsed = allergenMapSchema.parse({ mustard: 'contains', milk: 'free' });
    expect(Object.keys(parsed).sort()).toEqual([...ALLERGEN_IDS].sort());
  });

  it('rejects statuses outside the vocabulary', () => {
    expect(allergenMapSchema.safeParse({ milk: 'maybe' }).success).toBe(false);
  });

  it('parses the JSON column and rejects malformed text', () => {
    expect(allergenMapJsonSchema.parse('{"soy":"contains"}').soy).toBe('contains');
    expect(allergenMapJsonSchema.safeParse('{soy:').success).toBe(false);
    expect(allergenMapJsonSchema.safeParse('[]').success).toBe(false);
  });

  it('builds an all-unknown map as the safe default', () => {
    expect(Object.values(unknownAllergenMap()).every((s) => s === 'unknown')).toBe(true);
  });

  it('recognises allergen ids', () => {
    expect(isAllergenId('tree_nut')).toBe(true);
    expect(isAllergenId('nuts')).toBe(false);
    expect(isAllergenId(3)).toBe(false);
  });
});
