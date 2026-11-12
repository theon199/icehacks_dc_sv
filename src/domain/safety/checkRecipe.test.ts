import { checkRecipe, compileSafetyRules, isRecipeSafe } from './checkRecipe';
import { makeRecipe } from '../recommend/fixtures/makeRecipe';
import { ALLERGEN_IDS, ALLERGEN_STATUSES, type AllergenId } from '../types/allergens';
import { DIET_FLAG_NAMES, DietFlag, dietMask } from '../types/diet';
import { type RecipeSummary } from '../types/recipe';

const noDiets = { diets: [] } as const;

describe('checkRecipe allergens', () => {
  describe.each(ALLERGEN_IDS)('declared %s', (allergen) => {
    it.each(ALLERGEN_STATUSES)('status %s', (status) => {
      const recipe = makeRecipe({ allergens: { [allergen]: status } });
      const verdict = checkRecipe(recipe, { allergens: [allergen], ...noDiets });
      expect(verdict.eligible).toBe(status === 'free');
      expect(isRecipeSafe(recipe, compileSafetyRules({ allergens: [allergen], ...noDiets }))).toBe(
        status === 'free',
      );
      if (status === 'contains') {
        expect(verdict.reasons).toEqual([
          expect.objectContaining({ code: 'contains_allergen', allergen }),
        ]);
      }
      if (status === 'unknown') {
        expect(verdict.reasons).toEqual([
          expect.objectContaining({ code: 'allergen_unverified', allergen }),
        ]);
      }
    });
  });

  it('excludes unknown allergen status with an explanation the UI can show', () => {
    const recipe = makeRecipe({ allergens: { milk: 'unknown' } });
    expect(checkRecipe(recipe, { allergens: ['milk'], ...noDiets })).toEqual({
      eligible: false,
      reasons: [
        {
          code: 'allergen_unverified',
          allergen: 'milk',
          message: 'May contain milk: ingredient data incomplete',
        },
      ],
    });
  });

  it('names the allergen a recipe contains', () => {
    const recipe = makeRecipe({ allergens: { tree_nut: 'contains' } });
    expect(checkRecipe(recipe, { allergens: ['tree_nut'], ...noDiets }).reasons[0]?.message).toBe(
      'Contains tree nuts',
    );
  });

  it('ignores allergens the person did not declare', () => {
    const recipe = makeRecipe({ allergensDefault: 'unknown', allergens: { egg: 'contains' } });
    expect(checkRecipe(recipe, { allergens: [], ...noDiets }).eligible).toBe(true);
  });

  it('treats a missing allergen entry as unverified', () => {
    const base = makeRecipe();
    const { peanut: _drop, ...partial } = base.allergens;
    const recipe = { ...base, allergens: partial } as unknown as RecipeSummary;
    const verdict = checkRecipe(recipe, { allergens: ['peanut'], ...noDiets });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reasons[0]?.code).toBe('allergen_unverified');
  });

  it('treats a recipe with no allergen data at all as unverified', () => {
    const recipe = { ...makeRecipe(), allergens: undefined } as unknown as RecipeSummary;
    expect(checkRecipe(recipe, { allergens: ['soy'], ...noDiets }).eligible).toBe(false);
  });

  it('lists every failing allergen in declaration order', () => {
    const recipe = makeRecipe({ allergens: { milk: 'contains', sesame: 'unknown', soy: 'free' } });
    const declared: AllergenId[] = ['sesame', 'soy', 'milk'];
    expect(
      checkRecipe(recipe, { allergens: declared, ...noDiets }).reasons.map((r) => r.code),
    ).toEqual(['allergen_unverified', 'contains_allergen']);
  });
});

describe('checkRecipe diets', () => {
  it.each(DIET_FLAG_NAMES)('excludes a recipe that is not %s', (diet) => {
    const verdict = checkRecipe(makeRecipe({ dietFlags: 0 }), { allergens: [], diets: [diet] });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reasons).toEqual([expect.objectContaining({ code: 'diet_mismatch', diet })]);
  });

  it.each(DIET_FLAG_NAMES)('accepts a recipe that is %s', (diet) => {
    const recipe = makeRecipe({ dietFlags: DietFlag[diet] });
    expect(checkRecipe(recipe, { allergens: [], diets: [diet] }).eligible).toBe(true);
  });

  it('accepts vegan dishes for vegetarians and pescatarians', () => {
    const recipe = makeRecipe({ dietFlags: DietFlag.vegan });
    expect(
      checkRecipe(recipe, { allergens: [], diets: ['vegetarian', 'pescatarian'] }).eligible,
    ).toBe(true);
  });

  it('does not treat a vegan dish as gluten-free', () => {
    const recipe = makeRecipe({ dietFlags: DietFlag.vegan });
    expect(checkRecipe(recipe, { allergens: [], diets: ['gluten_free'] }).reasons).toEqual([
      { code: 'diet_mismatch', diet: 'gluten_free', message: 'Not gluten-free' },
    ]);
  });

  it('requires every followed diet', () => {
    const recipe = makeRecipe({ dietFlags: dietMask(['vegetarian']) });
    const verdict = checkRecipe(recipe, { allergens: [], diets: ['vegetarian', 'no_alcohol'] });
    expect(verdict.reasons.map((r) => r.message)).toEqual(['Not alcohol-free']);
  });

  it('reports allergens before diets', () => {
    const recipe = makeRecipe({ allergens: { fish: 'contains' }, dietFlags: 0 });
    const verdict = checkRecipe(recipe, { allergens: ['fish'], diets: ['vegetarian'] });
    expect(verdict.reasons.map((r) => r.code)).toEqual(['contains_allergen', 'diet_mismatch']);
  });

  it('accepts compiled rules', () => {
    const rules = compileSafetyRules({ allergens: ['egg', 'egg'], diets: ['vegan'] });
    expect(rules).toEqual({ allergens: ['egg'], requiredDiets: DietFlag.vegan });
    expect(checkRecipe(makeRecipe({ dietFlags: DietFlag.vegan }), rules).eligible).toBe(true);
  });
});
