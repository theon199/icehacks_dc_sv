import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gramsPerUnit, ingredientAllergens, ingredientDietFlags } from '../src/derive/ingredients.ts';
import { familyKey, goalTags, mapCourse } from '../src/derive/recipe.ts';
import { rollupAllergens, rollupDiet } from '../src/derive/rollup.ts';
import { ing, type IngredientDef } from '../src/knowledge/define.ts';
import { INGREDIENTS, INGREDIENT_BY_ID } from '../src/knowledge/index.ts';
import { alternativesOf, compoundAliasGaps } from '../src/match/audit.ts';
import { IngredientMatcher } from '../src/match/matcher.ts';
import { parseMeasure } from '../src/parse/measure.ts';
import { detectTimerSeconds } from '../src/parse/steps.ts';
import {
  applyFryingAbsorption,
  FRYING_OIL_ABSORBED_SHARE,
  FRYING_OIL_MAX_SHARE_OF_FOOD,
  titleRank,
  type ParsedLine,
} from '../src/pipeline/recipes.ts';
import { healthScore } from '../src/score.ts';
import { preferHttps, type LinkStatus } from '../src/sources/links.ts';
import { DietFlag, type Nutrition } from '../src/types.ts';

const matcher = new IngredientMatcher(INGREDIENTS);
const def = (id: string): IngredientDef => {
  const found = INGREDIENT_BY_ID.get(id);
  assert.ok(found, `missing ingredient ${id}`);
  return found;
};
/** Matches a full ingredient line the way the pipeline does and returns every matched entry. */
const matchedLine = (text: string): IngredientDef[] | null => {
  const result = matcher.matchLine(parseMeasure(text).rest);
  return result.id === null ? null : result.all.map(def);
};
const has = (flags: number, bit: number) => (flags & bit) !== 0;

describe('peanut and groundnut oils fail closed', () => {
  it('marks peanut oil as containing peanut', () => {
    assert.deepEqual(ingredientAllergens(def('peanut_oil')), ['peanut']);
    for (const text of ['2 tbsp peanut oil', '1 tbsp groundnut oil', '3 tbsp ground nut oil', '1 tbsp arachis oil']) {
      const line = matchedLine(text);
      assert.ok(line?.some((d) => d.id === 'peanut_oil'), text);
      assert.equal(rollupAllergens([line]).peanut, 'contains', text);
    }
  });

  it('treats spring roll wrappers as wheat-based and brand-dependent', () => {
    const line = matchedLine('12 spring roll wrappers');
    assert.equal(line?.[0]?.id, 'spring_roll_wrappers');
    const allergens = rollupAllergens([line]);
    assert.equal(allergens.wheat, 'contains');
    assert.equal(allergens.gluten, 'contains');
    assert.equal(allergens.egg, 'unknown');
    assert.equal(matchedLine('8 rice paper wrappers')?.[0]?.id, 'rice_paper');
  });
});

describe('combined synonyms never hide an animal option', () => {
  it('does not call chicken-or-vegetable bouillon vegetarian', () => {
    const line = matchedLine('1 teaspoon chicken or vegetable bouillon');
    const flags = rollupDiet([line, matchedLine('2 cups green peas')], rollupAllergens([line]));
    assert.equal(has(flags, DietFlag.vegetarian), false);
    assert.equal(has(flags, DietFlag.vegan), false);
  });

  it('does not call chicken-flavored ramen vegetarian', () => {
    const line = matchedLine('1 package chicken-flavored ramen noodles, broken up');
    assert.equal(line?.[0]?.id, 'chicken_ramen_noodles');
    const flags = rollupDiet([line, matchedLine('4 cups shredded cabbage')], rollupAllergens([line]));
    assert.equal(has(flags, DietFlag.vegetarian), false);
  });

  it('keeps milk when a line offers broth or milk', () => {
    const line = matchedLine('1 cup low sodium broth or milk');
    assert.equal(rollupAllergens([line]).milk, 'contains');
  });

  it('lists the alternatives an "or" synonym offers', () => {
    assert.deepEqual(alternativesOf('chicken or vegetable bouillon').sort(), ['chicken', 'chicken bouillon', 'vegetable bouillon']);
    assert.deepEqual(alternativesOf('chicken broth'), []);
  });

  it('finds no fail-open compound synonyms in the knowledge base', () => {
    assert.deepEqual(compoundAliasGaps(INGREDIENTS, matcher), []);
  });

  it('flags a compound synonym that is less restrictive than an alternative', () => {
    const lax = ing('test_lax_cube', 'other', { syn: ['pork or vegetable bouillon'] });
    const defs = [...INGREDIENTS, lax];
    const gaps = compoundAliasGaps(defs, new IngredientMatcher(defs));
    assert.ok(gaps.some((g) => g.id === 'test_lax_cube' && g.via === 'pork'), JSON.stringify(gaps));
  });

  it('keeps lamb stock out of beef', () => {
    assert.equal(def('lamb_stock').meat, 'lamb');
    assert.equal(matchedLine('500ml lamb stock')?.[0]?.id, 'lamb_stock');
    assert.ok(has(ingredientDietFlags(def('lamb_stock')), DietFlag.no_beef));
  });
});

describe('matcher: frying oil is not fries', () => {
  it('reads "Fry Oil" as oil', () => {
    assert.equal(matcher.matchLine('Fry Oil').id, 'vegetable_oil');
    assert.deepEqual(matcher.matchLine('Fry Vegetable Oil').all, ['vegetable_oil']);
    assert.equal(matcher.matchLine('french fries').id, 'fries');
  });
});

describe('stock cubes', () => {
  it('use regular-sodium bouillon unless the line says low sodium', () => {
    for (const id of ['stock_cube', 'chicken_stock_cube', 'beef_stock_cube']) assert.notEqual(def(id).fdc?.[0], 171613, id);
    assert.equal(def('low_sodium_beef_stock_cube').fdc?.[0], 171613);
    assert.equal(matchedLine('3 cubes low sodium beef bouillon')?.[0]?.id, 'low_sodium_beef_stock_cube');
  });

  it('name a ready-to-use stock for volume measures', () => {
    for (const id of ['stock_cube', 'chicken_stock_cube', 'beef_stock_cube', 'low_sodium_beef_stock_cube']) {
      const prepared = def(id).preparedAs;
      assert.ok(prepared && INGREDIENT_BY_ID.has(prepared), id);
    }
  });
});

describe('timers with unicode fractions', () => {
  it('keeps the whole number', () => {
    assert.equal(detectTimerSeconds('Simmer for 1½ hours without a lid.'), 5400);
    assert.equal(detectTimerSeconds('Soak for at least 1 ½ hours.'), 5400);
    assert.equal(detectTimerSeconds('Cook for 1½-2½ hrs, topping up the water.'), 5400);
    assert.equal(detectTimerSeconds('Boil the eggs for 6½ minutes.'), 390);
    assert.equal(detectTimerSeconds('Rest for ½ hour.'), 1800);
  });
});

describe('measure edge cases', () => {
  it('reads "1 – 14-ounce can" as one can, not a range', () => {
    const m = parseMeasure('1 – 14-ounce can Condensed Milk');
    assert.equal(m.quantity, 1);
    assert.equal(m.unit, 'can');
    assert.ok(Math.abs((m.grams ?? 0) - 396.9) < 1);
    assert.equal(m.rest, 'Condensed Milk');
    assert.equal(parseMeasure('1-2 cups rice').quantity, 1.5);
  });

  it('uses a bracketed size after a count', () => {
    const m = parseMeasure('1 (12 oz.) stir-fry vegetables');
    assert.equal(m.unit, 'oz');
    assert.ok(Math.abs((m.grams ?? 0) - 340.2) < 1);
    assert.equal(m.rest, 'stir-fry vegetables');
    assert.ok(Math.abs((parseMeasure('2 (6 oz) salmon fillets').grams ?? 0) - 340.2) < 1);
  });

  it('adds the ounces in "1 lb 2 oz"', () => {
    const m = parseMeasure('1 lb 2 oz plain flour');
    assert.ok(Math.abs((m.grams ?? 0) - 510.3) < 1);
    assert.equal(m.rest, 'plain flour');
  });

  it('prefers a stated weight after a household measure', () => {
    const cups = parseMeasure('2 cups (about 300g) flour');
    assert.equal(cups.grams, 300);
    assert.equal(cups.rest, 'flour');
    const can = parseMeasure('1 can (28 ounces) diced tomatoes');
    assert.equal(can.unit, 'can');
    assert.ok(Math.abs((can.grams ?? 0) - 793.8) < 1);
    const cans = parseMeasure('2 cans (15 ounces each) black beans');
    assert.ok(Math.abs((cans.grams ?? 0) - 850.5) < 1);
    assert.equal(cans.rest, 'black beans');
    // An equivalent volume after a volume keeps the household measure for density lookups.
    assert.equal(parseMeasure('1 cup (250ml) milk').grams, null);
  });

  it('keeps counted pieces when the size is not a weight', () => {
    const m = parseMeasure('3 2-inch pieces ginger');
    assert.equal(m.quantity, 3);
    assert.equal(m.grams, null);
  });
});

describe('household weights', () => {
  it('weighs a cup of cream as poured, not whipped', () => {
    const portions = [
      { amount: 1, label: 'cup, whipped', grams: 120 },
      { amount: 1, label: 'cup, fluid (yields 2 cups whipped)', grams: 238 },
      { amount: 1, label: 'tbsp', grams: 15 },
    ];
    assert.equal(gramsPerUnit(def('heavy_cream'), portions).cup, 238);
  });

  it('overrides implausible piece weights', () => {
    assert.ok((gramsPerUnit(def('mixed_vegetables'), [{ amount: 1, label: 'package (10 oz)', grams: 284 }]).piece ?? 0) <= 150);
    assert.ok((gramsPerUnit(def('vegetable_stock'), []).piece ?? 0) <= 250);
  });
});

describe('frying oil absorption', () => {
  const line = (id: string, text: string, grams: number, position: number): ParsedLine => {
    const d = def(id);
    return {
      name: text,
      row: { position, ingredient_id: id, text, quantity: null, unit: null, grams, section: null, optional: 0 },
      measure: parseMeasure(text),
      matched: [d],
      unresolved: [],
      primary: d,
      nutritionDef: d,
      eatenGrams: grams,
    };
  };

  it('counts only the absorbed share of a labelled frying oil', () => {
    const lines = [line('chicken_thigh', '1.5 kg chicken pieces', 1500, 1), line('vegetable_oil', '2 quarts neutral frying oil', 1744, 2)];
    applyFryingAbsorption(lines, ['Season the chicken.']);
    const absorbed = Math.min(1744 * FRYING_OIL_ABSORBED_SHARE, 1500 * FRYING_OIL_MAX_SHARE_OF_FOOD);
    assert.ok(Math.abs((lines[1]?.eatenGrams ?? 0) - absorbed) < 0.01);
    assert.equal(lines[1]?.row.grams, 1744, 'the ingredient row keeps the measured weight');
    assert.equal(lines[0]?.eatenGrams, 1500);
  });

  it('treats a large oil line as frying medium only when the method fries', () => {
    const fried = [line('flour', '500g flour', 500, 1), line('vegetable_oil', '1 L sunflower oil', 921, 2)];
    applyFryingAbsorption(fried, ['Heat the oil to 180C and fry the churros in batches.']);
    assert.ok((fried[1]?.eatenGrams ?? 0) < 100);

    const cake = [line('flour', '300g flour', 300, 1), line('vegetable_oil', '450ml vegetable oil', 414, 2)];
    applyFryingAbsorption(cake, ['Whisk the oil into the batter and bake for 40 minutes.']);
    assert.equal(cake[1]?.eatenGrams, 414);

    const stirFry = [line('rice', '300g rice', 300, 1), line('vegetable_oil', '1 cup oil', 218, 2)];
    applyFryingAbsorption(stirFry, ['Stir-fry the rice in a frying pan.']);
    assert.equal(stirFry[1]?.eatenGrams, 218);
  });
});

describe('course mapping', () => {
  it('files dips, salsas and dressings under snacks even when listed as dinner or dessert', () => {
    assert.equal(mapCourse('medlineplus', ['dinner', 'dips-salsas-and-sauces'], 'Ranch Dip'), 'snack');
    assert.equal(mapCourse('medlineplus', ['desserts', 'dips-salsas-and-sauces'], 'Peach Salsa'), 'snack');
    assert.equal(mapCourse('medlineplus', ['dinner'], 'Chicken Stew'), 'main');
  });
});

describe('dish families', () => {
  it('keeps sweet and fried versions apart from the plain dish', () => {
    assert.notEqual(familyKey('Sweet potato salad'), familyKey('Classic Potato Salad'));
    assert.notEqual(familyKey('Chicken Fried Rice'), familyKey('Chicken and Rice'));
    assert.equal(familyKey('Easy Meatballs'), familyKey('Baked Meatballs'));
  });
});

describe('missing nutrients are never treated as zero', () => {
  const base: Nutrition = {
    kcal: 400,
    protein_g: 25,
    carbs_g: 40,
    fat_g: 10,
    sat_fat_g: 2,
    fiber_g: 8,
    sugar_g: 5,
    added_sugar_g: 2,
    sodium_mg: 400,
  };
  const goals = (n: Nutrition) => goalTags({ nutrition: n, servingGrams: 350, course: 'main', vegetarian: false, vegan: false, plantShare: null });

  it('skips tags whose input is unknown', () => {
    assert.ok(goals(base).includes('heart_friendly'));
    assert.ok(!goals({ ...base, fiber_g: null }).includes('high_fiber'));
    assert.ok(!goals({ ...base, fiber_g: null }).includes('heart_friendly'));
    assert.ok(!goals({ ...base, added_sugar_g: null }).includes('heart_friendly'));
    assert.ok(!goals({ ...base, protein_g: null }).includes('high_protein'));
  });

  it('leaves unknown terms out of the health score', () => {
    const inputs = { kcal: 400, protein_g: 25, fiber_g: 8, sodium_mg: 400, sat_fat_g: 2, added_sugar_g: null, vegetableShare: 0.4 };
    const withZeroSugar = healthScore({ ...inputs, added_sugar_g: 0 });
    // Zero added sugar earns no penalty, but averaging over two penalties instead of three
    // must not make an unknown look better than a known zero.
    assert.ok(healthScore(inputs) <= withZeroSugar + 1e-9);
    assert.ok(healthScore({ ...inputs, sodium_mg: null }) > 0);
  });
});

describe('summaries', () => {
  it('ranks an ingredient made from a title food', () => {
    const named = new Set(['peanut']);
    assert.equal(titleRank(named, 'peanut'), 2);
    assert.equal(titleRank(named, 'peanut_butter'), 1);
    assert.equal(titleRank(named, 'chicken'), 0);
  });
});

describe('tutorial links', () => {
  const ok = (status: number, dead = false): LinkStatus => ({ status, dead, title: null, checkedAt: '2026-01-01T00:00:00.000Z' });

  it('upgrades http to https only when https answered', () => {
    const statuses = new Map([
      ['https://good.example/recipe', ok(200)],
      ['https://blocked.example/recipe', ok(403)],
    ]);
    assert.equal(preferHttps('http://good.example/recipe', statuses), 'https://good.example/recipe');
    assert.equal(preferHttps('http://blocked.example/recipe', statuses), 'http://blocked.example/recipe');
    assert.equal(preferHttps('http://unchecked.example/recipe', statuses), 'http://unchecked.example/recipe');
    assert.equal(preferHttps('https://good.example/recipe', statuses), 'https://good.example/recipe');
  });
});
