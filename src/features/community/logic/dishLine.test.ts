import { dishFacts } from './dishLine';
import { makeRecipe } from '../testing/fixtures';

function nutrition(kcal: number) {
  return {
    kcal,
    proteinG: null,
    carbsG: null,
    fatG: null,
    satFatG: null,
    fiberG: null,
    sugarG: null,
    addedSugarG: null,
    sodiumMg: null,
  };
}

describe('dishFacts', () => {
  it('joins cooking time and energy', () => {
    const recipe = makeRecipe({
      totalMinutes: 25,
      nutritionConfidence: 'computed',
      nutrition: nutrition(473.2),
    });
    expect(dishFacts(recipe)).toBe('25 min · 473 kcal');
  });

  it('labels estimated energy', () => {
    const recipe = makeRecipe({
      totalMinutes: 25,
      nutritionConfidence: 'estimated',
      nutrition: nutrition(400),
    });
    expect(dishFacts(recipe)).toBe('25 min · 400 kcal (estimated)');
  });

  it('leaves out what the catalog does not know', () => {
    expect(
      dishFacts(makeRecipe({ totalMinutes: null, nutritionConfidence: 'none', nutrition: null })),
    ).toBe('');
  });
});
