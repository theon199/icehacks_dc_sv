import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ing } from '../src/knowledge/define.ts';
import { INGREDIENT_BY_ID } from '../src/knowledge/index.ts';
import { ingredientAllergens, ingredientDietFlags } from '../src/derive/ingredients.ts';
import { rollupAllergens, rollupDiet, type MatchedLine } from '../src/derive/rollup.ts';
import { ALLERGEN_IDS, DietFlag } from '../src/types.ts';

const def = (id: string) => {
  const found = INGREDIENT_BY_ID.get(id);
  assert.ok(found, `missing ingredient ${id}`);
  return found;
};
const line = (...ids: string[]): MatchedLine => ids.map(def);
const has = (flags: number, bit: number) => (flags & bit) !== 0;

describe('ingredient allergens', () => {
  it('tags condiments conservatively', () => {
    assert.deepEqual(ingredientAllergens(def('soy_sauce')), ['wheat', 'soy', 'gluten']);
    assert.deepEqual(ingredientAllergens(def('pesto')), ['milk', 'tree_nut']);
    assert.ok(ingredientAllergens(def('worcestershire_sauce')).includes('fish'));
    assert.ok(ingredientAllergens(def('fish_sauce')).includes('fish'));
    assert.ok(ingredientAllergens(def('oyster_sauce')).includes('shellfish'));
  });

  it('always adds gluten when wheat is present', () => {
    const custom = ing('test_wheat', 'grain', { allergens: ['wheat'] });
    assert.deepEqual(ingredientAllergens(custom), ['wheat', 'gluten']);
  });

  it('treats molluscs as shellfish and oats as gluten', () => {
    assert.ok(ingredientAllergens(def('squid')).includes('shellfish'));
    assert.ok(ingredientAllergens(def('mussel')).includes('shellfish'));
    assert.ok(ingredientAllergens(def('oats')).includes('gluten'));
  });
});

describe('recipe allergen roll-up (fail-closed)', () => {
  it('is free only when every line is matched and fully known', () => {
    const result = rollupAllergens([line('olive_oil'), line('tomato'), line('salt')]);
    for (const a of ALLERGEN_IDS) assert.equal(result[a], 'free', a);
  });

  it('marks contained allergens as contains', () => {
    const result = rollupAllergens([line('soy_sauce'), line('rice')]);
    assert.equal(result.soy, 'contains');
    assert.equal(result.wheat, 'contains');
    assert.equal(result.gluten, 'contains');
    assert.equal(result.milk, 'free');
  });

  it('turns every other allergen unknown when a line is unmatched', () => {
    const result = rollupAllergens([line('egg'), null]);
    assert.equal(result.egg, 'contains');
    for (const a of ALLERGEN_IDS.filter((x) => x !== 'egg')) assert.equal(result[a], 'unknown', a);
  });

  it('turns other allergens unknown for variable store-bought products', () => {
    const result = rollupAllergens([line('bread'), line('tomato')]);
    assert.equal(result.wheat, 'contains');
    assert.equal(result.sesame, 'unknown');
    assert.equal(result.milk, 'unknown');
  });

  it('counts every alternative on a line', () => {
    const result = rollupAllergens([line('margarine', 'vegetable_oil')]);
    assert.equal(result.milk, 'contains');
  });
});

describe('diet flags', () => {
  it('derives per-ingredient flags from animal content', () => {
    assert.ok(has(ingredientDietFlags(def('tofu')), DietFlag.vegan));
    assert.ok(!has(ingredientDietFlags(def('honey')), DietFlag.vegan));
    assert.ok(has(ingredientDietFlags(def('honey')), DietFlag.vegetarian));
    assert.ok(!has(ingredientDietFlags(def('salmon')), DietFlag.vegetarian));
    assert.ok(has(ingredientDietFlags(def('salmon')), DietFlag.pescatarian));
    assert.ok(!has(ingredientDietFlags(def('bacon')), DietFlag.no_pork));
    assert.ok(!has(ingredientDietFlags(def('beef_stock')), DietFlag.no_beef));
    assert.ok(!has(ingredientDietFlags(def('red_wine')), DietFlag.no_alcohol));
    assert.ok(!has(ingredientDietFlags(def('gelatin')), DietFlag.halal_friendly));
    assert.ok(!has(ingredientDietFlags(def('gelatin')), DietFlag.no_pork));
    assert.ok(has(ingredientDietFlags(def('chicken')), DietFlag.halal_friendly));
  });

  it('never claims vegan or gluten-free for brand-variable products unless sold as plant-based', () => {
    assert.ok(!has(ingredientDietFlags(def('bread')), DietFlag.vegan));
    assert.ok(!has(ingredientDietFlags(def('stock_cube')), DietFlag.gluten_free));
    assert.ok(has(ingredientDietFlags(def('vegan_butter')), DietFlag.vegan));
    assert.ok(!has(ingredientDietFlags(def('vegan_butter')), DietFlag.dairy_free));
  });

  it('intersects flags across a recipe', () => {
    const lines = [line('chickpea'), line('olive_oil'), line('lemon_juice')];
    const flags = rollupDiet(lines, rollupAllergens(lines));
    for (const bit of Object.values(DietFlag)) assert.ok(has(flags, bit), `bit ${bit}`);
    const withCheese = [...lines, line('feta')];
    const cheeseFlags = rollupDiet(withCheese, rollupAllergens(withCheese));
    assert.ok(has(cheeseFlags, DietFlag.vegetarian));
    assert.ok(!has(cheeseFlags, DietFlag.vegan));
    assert.ok(!has(cheeseFlags, DietFlag.dairy_free));
  });

  it('claims nothing when any line is unmatched', () => {
    const lines: MatchedLine[] = [line('rice'), null];
    assert.equal(rollupDiet(lines, rollupAllergens(lines)), 0);
  });

  it('requires a free gluten status for gluten_free', () => {
    const lines = [line('rice'), line('bread')];
    assert.ok(!has(rollupDiet(lines, rollupAllergens(lines)), DietFlag.gluten_free));
  });
});
