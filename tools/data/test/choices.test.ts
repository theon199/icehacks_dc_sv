import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rollupAllergens, rollupDiet, type MatchedLine } from '../src/derive/rollup.ts';
import type { IngredientDef } from '../src/knowledge/define.ts';
import { INGREDIENT_BY_ID, INGREDIENTS } from '../src/knowledge/index.ts';
import { IngredientMatcher } from '../src/match/matcher.ts';
import { parseMeasure } from '../src/parse/measure.ts';
import { buildRecipe, type RecipeContext } from '../src/pipeline/recipes.ts';
import type { BuildIssue } from '../src/pipeline/types.ts';
import { ALLERGEN_IDS, type AllergenId, type SourceRecipe } from '../src/types.ts';

const matcher = new IngredientMatcher(INGREDIENTS);
const match = (text: string) => matcher.matchLine(parseMeasure(text).rest);
const def = (id: string): IngredientDef => {
  const found = INGREDIENT_BY_ID.get(id);
  assert.ok(found, `missing ingredient ${id}`);
  return found;
};
/** Matches a line the way the pipeline does, including any unidentified choice. */
const matchedLine = (text: string): MatchedLine => {
  const result = match(text);
  if (result.id === null) return null;
  const defs = result.all.map(def);
  return result.unresolved.length > 0 ? { defs, unresolved: result.unresolved } : defs;
};
const statesOf = (lines: MatchedLine[], state: string): AllergenId[] => {
  const allergens = rollupAllergens(lines);
  return ALLERGEN_IDS.filter((a) => allergens[a] === state);
};

describe('a choice the knowledge base cannot identify', () => {
  it('keeps the known choice for nutrition and reports the other as unresolved', () => {
    for (const text of ['2 tbsp peanut butter or halva spread', '2 tbsp peanut butter (or halva spread)', '2 tbsp peanut butter, or halva spread']) {
      const result = match(text);
      assert.equal(result.id, 'peanut_butter', text);
      assert.deepEqual(result.unresolved, ['halva spread'], text);
    }
  });

  it('makes every allergen the known choice does not contain unknown, never free', () => {
    const lines = [matchedLine('2 tbsp peanut butter or halva spread'), matchedLine('2 cups white rice')];
    assert.deepEqual(statesOf(lines, 'contains'), ['peanut']);
    assert.deepEqual(statesOf(lines, 'free'), []);
    assert.ok(statesOf(lines, 'unknown').includes('tree_nut'));
    assert.ok(statesOf(lines, 'unknown').includes('milk'));
  });

  it('clears every diet flag', () => {
    const lines = [matchedLine('2 tbsp peanut butter or halva spread')];
    assert.equal(rollupDiet(lines, rollupAllergens(lines)), 0);
  });

  it('applies when the unidentified choice comes first', () => {
    const result = match('2 tbsp halva spread or peanut butter');
    assert.equal(result.id, 'peanut_butter');
    assert.deepEqual(result.unresolved, ['halva spread']);
  });

  it('applies to an unidentified item listed with a known one', () => {
    const result = match('1 cup white rice and furikake');
    assert.equal(result.id, 'rice');
    assert.deepEqual(result.unresolved, ['furikake']);
  });
});

describe('choices that are all identified', () => {
  it('contains the union of both choices and leaves the rest free', () => {
    const lines = [matchedLine('50g butter or margarine spread')];
    assert.deepEqual(statesOf(lines, 'contains'), ['milk', 'soy']);
    assert.deepEqual(statesOf(lines, 'unknown'), []);
    const milks = [matchedLine('1 cup soy milk or almond milk')];
    assert.deepEqual(statesOf(milks, 'contains'), ['tree_nut', 'soy']);
    assert.deepEqual(statesOf(milks, 'unknown'), []);
  });

  it('reads a shared word as part of each choice', () => {
    const stock = match('1 litre chicken or vegetable stock');
    assert.equal(stock.id, 'chicken_stock');
    assert.ok(stock.all.includes('vegetable_stock'));
    assert.deepEqual(stock.unresolved, []);
    assert.equal(match('1 litre chicken/vegetable stock').id, 'chicken_stock');
    assert.equal(match('500g beef or chicken mince').id, 'ground_beef');
    const thighs = match('4 chicken thighs or 2 breasts');
    assert.equal(thighs.id, 'chicken_thigh');
    assert.ok(thighs.all.includes('chicken_breast'));
    assert.deepEqual(thighs.unresolved, []);
  });

  it('keeps a plain choice when the other choice only extends it', () => {
    const result = match('1 cup cream or cream cheese');
    assert.equal(result.id, 'heavy_cream');
    assert.ok(result.all.includes('cream_cheese'));
  });
});

describe('choices that are comments or descriptions, not ingredients', () => {
  it('does not treat amounts, serving notes or descriptions as unidentified', () => {
    for (const text of [
      'salt or to taste',
      'salt, or to taste',
      '1 tsp chilli flakes (or to taste)',
      '2 tbsp olive oil or as needed',
      '1 cup heavy cream or more',
      '1 cup heavy cream (or more if needed)',
      '2 cups fresh or frozen peas',
      '2 tbsp olive oil, plus extra for greasing',
      '1 tbsp honey (or 2 tsp sugar)',
      '1 tsp dried oregano (or 1 tbsp fresh)',
      'salt and freshly ground black pepper',
      '1/2 cup canned pineapple tidbits or chunks (drained)',
      '2/3 cup low-fat vanilla yogurt or 1 container (6 ounces)',
      '5 cups thinly sliced cabbage (about 1 1/2 pounds or 1/2 small head - try a mix of red and green)',
    ]) {
      const result = match(text);
      assert.notEqual(result.id, null, text);
      assert.deepEqual(result.unresolved, [], text);
    }
  });

  it('leaves allergens free when the only other choice is a comment', () => {
    const lines = [matchedLine('salt or to taste'), matchedLine('2 tbsp olive oil or as needed'), matchedLine('2 cups white rice')];
    assert.deepEqual(statesOf(lines, 'free'), [...ALLERGEN_IDS]);
  });
});

describe('recipe roll-up with an unidentified choice', () => {
  const ctx: RecipeContext = { matcher, defs: INGREDIENT_BY_ID, profiles: new Map(), units: new Map(), links: new Map() };
  const source = (lines: string[]): SourceRecipe => ({
    id: 'test:1',
    source: 'mealdb',
    sourceId: '1',
    title: 'Banana Toast',
    categories: ['Breakfast'],
    area: null,
    tags: [],
    lines: lines.map((text) => ({ text })),
    instructions: ['Toast the bread.', 'Spread and top with banana.'],
    servings: 2,
    prepMinutes: null,
    cookMinutes: null,
    totalMinutes: null,
    imageUrl: null,
    imageCredit: null,
    sourceName: 'Test',
    sourceUrl: null,
    license: 'test',
    tutorials: [],
    publishedNutrition: null,
  });

  it('never reports an allergen as free and records a build note', () => {
    const issues: BuildIssue[] = [];
    const recipe = buildRecipe(source(['2 bananas', '2 tbsp peanut butter or halva spread']), ctx, issues);
    assert.ok(recipe);
    assert.equal(recipe.allergens.peanut, 'contains');
    assert.ok(ALLERGEN_IDS.every((a) => recipe.allergens[a] !== 'free'));
    assert.equal(recipe.diet_flags, 0);
    assert.equal(recipe.partial_lines, 1);
    assert.equal(recipe.ingredients[1]?.ingredient_id, 'peanut_butter');
    assert.ok(issues.some((i) => i.kind === 'unresolved_choice'));
  });

  it('keeps a fully identified recipe free of what it does not contain', () => {
    const recipe = buildRecipe(source(['2 bananas', '2 tbsp peanut butter or to taste']), ctx, []);
    assert.ok(recipe);
    assert.equal(recipe.partial_lines, 0);
    assert.equal(recipe.allergens.milk, 'free');
  });
});

describe('words of a choice that no ingredient accounts for', () => {
  const notFree = (text: string, allergens: AllergenId[]) => {
    const lines = [matchedLine(text)];
    const free = statesOf(lines, 'free');
    for (const allergen of allergens) assert.ok(!free.includes(allergen), `${text}: ${allergen} reported free`);
  };

  it('leaves a partly named spread unidentified while its nut still counts', () => {
    for (const text of ['2 tbsp peanut butter or (chocolate) hazelnut spread', '2 tbsp peanut butter or chocolate hazelnut spread']) {
      const result = match(text);
      assert.equal(result.id, 'peanut_butter', text);
      assert.ok(result.all.includes('hazelnut'), text);
      assert.equal(result.unresolved.length, 1, text);
      const lines = [matchedLine(text)];
      assert.ok(statesOf(lines, 'contains').includes('peanut'), text);
      assert.ok(statesOf(lines, 'contains').includes('tree_nut'), text);
      assert.deepEqual(statesOf(lines, 'free'), [], text);
    }
  });

  it('does not let a known word stand for a product it only partly names', () => {
    assert.deepEqual(match('almond butter or cookie butter').unresolved, ['cookie butter']);
    notFree('almond butter or cookie butter', ['wheat', 'gluten', 'soy', 'egg']);
    assert.deepEqual(match('1/2 cup mayo or vegan mayo').unresolved, ['vegan mayo']);
    notFree('1/2 cup mayo or vegan mayo', ['soy', 'tree_nut']);
    assert.deepEqual(match('1/2 cup sour cream or vegan sour cream').unresolved, ['vegan sour cream']);
    notFree('1/2 cup sour cream or vegan sour cream', ['soy', 'tree_nut']);
  });

  it('accepts descriptions next to a named ingredient', () => {
    for (const text of [
      '2 tablespoons peeled and chopped fresh ginger, or 1 teaspoon powdered ginger',
      '1 can corn, drained (or 1 cup frozen corn, thawed)',
      '4 tbsp mango juice (or 1 fresh pitted mango)',
      '1 cup cooked ground turkey or turkey breast cut into 1/2-inch cubes',
      '1 cup whipped cream or yogurt',
    ]) {
      assert.deepEqual(match(text).unresolved, [], text);
    }
  });

  it('reads a leading "substitute" as the verb, not as a stand-in product', () => {
    const result = match('1 cup fresh blueberries, rinsed (or substitute frozen blueberries, thawed)');
    assert.equal(result.id, 'blueberry');
    assert.deepEqual(result.unresolved, []);
  });

  it('names a seed butter as itself rather than as dairy butter', () => {
    const result = match('2 tbsp tahini or sunflower seed butter');
    assert.deepEqual(result.all, ['tahini', 'sunflower_seed_butter']);
    assert.deepEqual(statesOf([matchedLine('2 tbsp tahini or sunflower seed butter')], 'contains'), ['sesame']);
  });
});

describe('open-ended choices', () => {
  it('leaves a choice that could be anything unidentified', () => {
    const cases: Array<[string, AllergenId[]]> = [
      ['1 cup milk or substitute', ['soy', 'tree_nut']],
      ['1 cup milk or similar', ['soy', 'tree_nut']],
      ['1 cup milk or equivalent', ['soy', 'tree_nut']],
      ['1 cup almond milk or other', ['milk', 'soy']],
      ['2 tbsp peanut butter or your favourite', ['tree_nut', 'milk', 'soy']],
      ['2 tbsp peanut butter, or any other kind', ['tree_nut', 'milk', 'soy']],
      ['2 tbsp butter or other fat', ['soy']],
      ['1 cup whipped cream or topping', ['soy']],
      ['1 tsp cinnamon or other flavorings', ['tree_nut', 'milk']],
    ];
    for (const [text, allergens] of cases) {
      const result = match(text);
      assert.notEqual(result.id, null, text);
      assert.equal(result.unresolved.length, 1, text);
      const free = statesOf([matchedLine(text)], 'free');
      for (const allergen of allergens) assert.ok(!free.includes(allergen), `${text}: ${allergen} reported free`);
    }
  });

  it('treats a product made to replace another as unidentified', () => {
    assert.deepEqual(match('2 tbsp butter or butter substitute').unresolved, ['butter substitute']);
    assert.deepEqual(match('1 cup milk or a dairy alternative').unresolved, ['a dairy alternative']);
  });

  it('still identifies an open-ended choice that names an ingredient', () => {
    for (const text of ['1/2 cup raisins or other dried fruit', '1/4 cup raisins, or other dried fruit', '1 cup blueberries or other fruit']) {
      const result = match(text);
      assert.deepEqual(result.unresolved, [], text);
      assert.deepEqual(statesOf([matchedLine(text)], 'unknown'), [], text);
    }
    assert.ok(match('1/4 cup raisins, or other dried fruit').all.includes('dried_fruit'));
  });

  it('accepts a blend of choices only when the line names two of them', () => {
    for (const text of ['2 red or green peppers, or a mix', '2 tbsp butter or olive oil, or both', 'a pinch of cinnamon or nutmeg, or a combination', 'either butter or olive oil']) {
      assert.deepEqual(match(text).unresolved, [], text);
    }
    assert.deepEqual(match('1 can black beans (or a mix)').unresolved, ['a mix']);
  });

  it('lists each ingredient once', () => {
    const result = match('1 tsp cinnamon or cinnamon and nutmeg');
    assert.equal(new Set(result.all).size, result.all.length);
  });
});
