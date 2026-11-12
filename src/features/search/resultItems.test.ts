import { compileSafetyRules } from '@/domain/safety';
import { DietFlag } from '@/lib/catalog';

import { allFree, searchRecipe } from './__fixtures__/recipes';
import { toSafetyPrefs } from './deps';
import { resultItemCache, toResultItem, toResultItems } from './resultItems';

const peanutAllergy = compileSafetyRules({ allergens: ['peanut'], diets: [] });

describe('search result safety', () => {
  it('leaves recipes that fit unbadged', () => {
    const item = toResultItem(searchRecipe('a'), peanutAllergy);
    expect(item).toMatchObject({ eligible: true, badge: null, reasons: [] });
  });

  it('keeps a recipe with a declared allergen and marks it', () => {
    const recipe = searchRecipe('b', { allergens: { ...allFree(), peanut: 'contains' } });
    const item = toResultItem(recipe, peanutAllergy);
    expect(item.eligible).toBe(false);
    expect(item.badge).toBe('Contains peanuts');
    expect(item.reasons).toEqual(['Contains peanuts']);
  });

  it('treats unverified allergen data as not safe', () => {
    const recipe = searchRecipe('c', { allergens: { ...allFree(), peanut: 'unknown' } });
    const item = toResultItem(recipe, peanutAllergy);
    expect(item.eligible).toBe(false);
    expect(item.badge).toBe('May contain peanuts');
  });

  it('summarises several reasons on the badge and lists them all for VoiceOver', () => {
    const rules = compileSafetyRules({ allergens: ['milk'], diets: ['vegetarian'] });
    const recipe = searchRecipe('d', { allergens: { ...allFree(), milk: 'contains' } });
    const item = toResultItem(recipe, rules);
    expect(item.badge).toBe('Contains milk +1');
    expect(item.reasons).toHaveLength(2);
  });

  it('marks every result until the allergy question is answered', () => {
    const rules = compileSafetyRules(
      toSafetyPrefs({ allergens: [], diets: [], allergensAnswered: false }),
    );
    const item = toResultItem(searchRecipe('e', { dietFlags: DietFlag.vegan }), rules);
    expect(item.eligible).toBe(false);
    expect(item.badge).toBe('Allergies not set');
  });

  it('counts an explicit "no allergies" answer as answered', () => {
    const rules = compileSafetyRules(
      toSafetyPrefs({ allergens: [], diets: [], allergensAnswered: true }),
    );
    expect(toResultItem(searchRecipe('f'), rules).eligible).toBe(true);
  });

  it('never drops ineligible recipes and keeps page order without duplicates', () => {
    const fits = searchRecipe('1');
    const unsafe = searchRecipe('2', { allergens: { ...allFree(), peanut: 'contains' } });
    const items = toResultItems(
      [
        { items: [fits, unsafe], nextCursor: 2 },
        { items: [unsafe, searchRecipe('3')], nextCursor: null },
      ],
      resultItemCache(peanutAllergy),
    );
    expect(items.map((i) => [i.recipe.id, i.eligible])).toEqual([
      ['1', true],
      ['2', false],
      ['3', true],
    ]);
  });

  it('has nothing to show before the first page arrives', () => {
    expect(toResultItems(undefined, resultItemCache(peanutAllergy))).toEqual([]);
  });

  it('reuses the entries already built when another page arrives', () => {
    const itemFor = resultItemCache(peanutAllergy);
    const first = { items: [searchRecipe('1'), searchRecipe('2')], nextCursor: 2 };
    const before = toResultItems([first], itemFor);
    const after = toResultItems([first, { items: [searchRecipe('3')], nextCursor: null }], itemFor);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(after).toHaveLength(3);
  });

  it('rebuilds entries for new safety rules', () => {
    const page = {
      items: [searchRecipe('1', { allergens: { ...allFree(), milk: 'contains' } })],
      nextCursor: null,
    };
    const [lenient] = toResultItems([page], resultItemCache(peanutAllergy));
    const milkAllergy = compileSafetyRules({ allergens: ['milk'], diets: [] });
    const [strict] = toResultItems([page], resultItemCache(milkAllergy));
    expect(lenient?.eligible).toBe(true);
    expect(strict?.eligible).toBe(false);
  });
});
