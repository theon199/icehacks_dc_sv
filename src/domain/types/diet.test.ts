import {
  ALL_DIET_BITS,
  DIET_FLAG_NAMES,
  DietFlag,
  dietFlagNameSchema,
  dietMask,
  dietNames,
  hasDiet,
  missingDiets,
  satisfiesDiet,
  withImpliedDiets,
} from './diet';

describe('diet flags', () => {
  it('gives every named diet its own bit', () => {
    expect(Object.keys(DietFlag).sort()).toEqual([...DIET_FLAG_NAMES].sort());
    const bits = DIET_FLAG_NAMES.map((name) => DietFlag[name]);
    expect(new Set(bits).size).toBe(bits.length);
    expect(dietFlagNameSchema.safeParse('keto').success).toBe(false);
  });

  it('uses the bit values from the catalog contract', () => {
    expect(DietFlag).toEqual({
      vegetarian: 1,
      vegan: 2,
      pescatarian: 4,
      no_pork: 8,
      no_alcohol: 16,
      no_beef: 32,
      gluten_free: 64,
      dairy_free: 128,
      halal_friendly: 256,
    });
    expect(ALL_DIET_BITS).toBe(511);
  });

  it('round-trips names and masks', () => {
    const mask = dietMask(['vegan', 'gluten_free']);
    expect(mask).toBe(66);
    expect(dietNames(mask)).toEqual(['vegan', 'gluten_free']);
    expect(hasDiet(mask, 'vegan')).toBe(true);
    expect(hasDiet(mask, 'vegetarian')).toBe(false);
  });

  it('implies meat-free diets from vegan and vegetarian', () => {
    const implied = withImpliedDiets(DietFlag.vegan);
    expect(dietNames(implied)).toEqual([
      'vegetarian',
      'vegan',
      'pescatarian',
      'no_pork',
      'no_beef',
    ]);
  });

  it('never implies allergen-like diets', () => {
    const implied = withImpliedDiets(DietFlag.vegan);
    expect(hasDiet(implied, 'dairy_free')).toBe(false);
    expect(hasDiet(implied, 'gluten_free')).toBe(false);
    expect(hasDiet(implied, 'no_alcohol')).toBe(false);
  });

  it('checks that every required diet is satisfied', () => {
    const recipe = DietFlag.vegetarian | DietFlag.gluten_free;
    expect(satisfiesDiet(recipe, dietMask(['pescatarian', 'gluten_free']))).toBe(true);
    expect(satisfiesDiet(recipe, dietMask(['vegan']))).toBe(false);
    expect(missingDiets(recipe, dietMask(['vegan', 'dairy_free', 'no_pork']))).toBe(
      DietFlag.vegan | DietFlag.dairy_free,
    );
    expect(satisfiesDiet(0, 0)).toBe(true);
  });

  it('ignores bits outside the contract', () => {
    expect(withImpliedDiets(1024)).toBe(0);
  });
});
