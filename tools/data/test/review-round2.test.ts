import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ingredientDietFlags } from '../src/derive/ingredients.ts';
import { estimateServings, isGentle, type GentleInputs } from '../src/derive/recipe.ts';
import { rollupAllergens, rollupDiet, type MatchedLine } from '../src/derive/rollup.ts';
import type { IngredientDef } from '../src/knowledge/define.ts';
import { INGREDIENTS, INGREDIENT_BY_ID } from '../src/knowledge/index.ts';
import { SEARCH_ALIASES } from '../src/knowledge/searchAliases.ts';
import { IngredientMatcher } from '../src/match/matcher.ts';
import { parseMeasure } from '../src/parse/measure.ts';
import { detectTimerSeconds, splitSteps } from '../src/parse/steps.ts';
import { SearchIndexer } from '../src/pipeline/search.ts';
import { DietFlag } from '../src/types.ts';

const matcher = new IngredientMatcher(INGREDIENTS);
const def = (id: string): IngredientDef => {
  const found = INGREDIENT_BY_ID.get(id);
  assert.ok(found, `missing ingredient ${id}`);
  return found;
};
const matchId = (text: string): string | null => matcher.matchLine(parseMeasure(text).rest).id;
const matchedLine = (text: string): MatchedLine => {
  const result = matcher.matchLine(parseMeasure(text).rest);
  return result.id === null ? null : result.all.map(def);
};
const has = (flags: number, bit: number) => (flags & bit) !== 0;

describe('ribbon pasta and gnocchi allergens', () => {
  it('maps fettuccine, tagliatelle and pappardelle to egg pasta, which contains egg', () => {
    for (const text of ['400g fettuccine', '1 lb fettuccine pasta', '250g tagliatelle', '300g pappardelle']) {
      assert.equal(matchId(text), 'egg_pasta', text);
    }
    assert.ok(def('egg_pasta').allergens.includes('egg'));
  });

  it('never lets a fettuccine recipe claim egg-free', () => {
    const allergens = rollupAllergens([matchedLine('1 lb fettuccine'), matchedLine('1 cup heavy cream'), matchedLine('1/2 cup parmesan')]);
    assert.notEqual(allergens.egg, 'free');
  });

  it('gives gnocchi its own variable entry that is not dry pasta', () => {
    assert.equal(matchId('500g gnocchi'), 'gnocchi');
    const gnocchi = def('gnocchi');
    assert.ok(gnocchi.variable);
    assert.notEqual(gnocchi.fdc?.[0], def('pasta').fdc?.[0]);
    const allergens = rollupAllergens([matchedLine('500g gnocchi'), matchedLine('2 tbsp olive oil')]);
    assert.equal(allergens.wheat, 'contains');
    assert.equal(allergens.egg, 'unknown');
    assert.equal(allergens.milk, 'unknown');
  });

  it('keeps fresh pasta off lasagna sheets and sushi rice off arborio', () => {
    assert.equal(matchId('250g fresh pasta'), 'fresh_pasta');
    assert.equal(matchId('2 cups sushi rice'), 'short_grain_rice');
    assert.equal(matchId('300g arborio rice'), 'arborio_rice');
  });
});

describe('unspecified meat claims no diet', () => {
  for (const text of ['4 sausages', '6 hot dogs', '8 frankfurters', '1 lb kielbasa', '2 bratwurst', '200g kidneys']) {
    it(`"${text}" is neither no_beef nor no_pork`, () => {
      const flags = rollupDiet([matchedLine(text)], rollupAllergens([matchedLine(text)]));
      assert.ok(!has(flags, DietFlag.no_beef), text);
      assert.ok(!has(flags, DietFlag.no_pork), text);
      assert.ok(!has(flags, DietFlag.halal_friendly), text);
    });
  }

  it('still reads named pork sausages as pork', () => {
    assert.equal(matchId('6 pork sausages'), 'pork_sausage');
    const flags = ingredientDietFlags(def('pork_sausage'));
    assert.ok(has(flags, DietFlag.no_beef));
    assert.ok(!has(flags, DietFlag.no_pork));
  });

  it('maps lamb kidneys to lamb and plain kidneys to mixed', () => {
    assert.equal(matchId('4 lamb kidneys'), 'lamb_kidney');
    assert.equal(def('kidney').meat, 'mixed');
  });
});

describe('stock cubes', () => {
  it('treats a cube that does not name its base as unspecified meat', () => {
    for (const text of ['2 stock cubes', '1 bouillon cube', '1 stock pot']) {
      assert.equal(matchId(text), 'stock_cube', text);
      const flags = rollupDiet([matchedLine(text)], rollupAllergens([matchedLine(text)]));
      assert.ok(!has(flags, DietFlag.vegetarian), text);
      assert.ok(!has(flags, DietFlag.no_beef), text);
    }
  });

  it('keeps vegetable stock cubes vegetarian (but not vegan, as brands vary)', () => {
    for (const text of ['1 vegetable stock cube', '2 tsp vegetable bouillon']) {
      assert.equal(matchId(text), 'vegetable_stock_cube', text);
      const flags = ingredientDietFlags(def('vegetable_stock_cube'));
      assert.ok(has(flags, DietFlag.vegetarian));
      assert.ok(!has(flags, DietFlag.vegan));
    }
  });
});

describe('search index words', () => {
  const indexer = new SearchIndexer(INGREDIENTS);
  const wordsFor = (text: string): string[] => {
    const name = parseMeasure(text).rest;
    const line = matchedLine(text);
    assert.ok(line, `unmatched ${text}`);
    return line.flatMap((d) => indexer.lineWords(d, name));
  };

  it('does not index another food named in a synonym ("beef tomatoes")', () => {
    const words = wordsFor('4 beef tomatoes');
    assert.ok(words.includes('tomato') || words.includes('tomatoes'), words.join(' '));
    assert.ok(!words.includes('beef'), words.join(' '));
  });

  it('does not index sibling varieties the line does not use', () => {
    const words = wordsFor('300g penne');
    assert.ok(words.includes('penne'), words.join(' '));
    assert.ok(words.includes('pasta'), words.join(' '));
    for (const sibling of ['rigatoni', 'farfalle', 'gnocchi', 'tagliatelle', 'orzo']) assert.ok(!words.includes(sibling), sibling);
  });

  it('does not index words from compound synonyms ("chicken or vegetable broth")', () => {
    const words = wordsFor('2 cups low sodium broth');
    assert.ok(!words.includes('vegetable'), words.join(' '));
    assert.ok(!words.includes('water'), words.join(' '));
  });

  it('indexes name modifiers only when the line uses them', () => {
    const oil = wordsFor('2 tbsp sunflower oil');
    assert.ok(oil.includes('oil'), oil.join(' '));
    assert.ok(!oil.includes('vegetable'), oil.join(' '));
    const pasta = wordsFor('1 lb fettuccine');
    assert.ok(pasta.includes('fettuccine') && pasta.includes('pasta'), pasta.join(' '));
    assert.ok(!pasta.includes('egg'), pasta.join(' '));
    assert.ok(wordsFor('1 litre vegetable stock').includes('vegetable'));
  });

  it('indexes curated aliases so other dialects find the recipe', () => {
    assert.ok(wordsFor('400g chickpeas').includes('garbanzo'));
    assert.ok(wordsFor('1 eggplant').includes('aubergine'));
    assert.ok(wordsFor('2 courgettes').includes('zucchini'));
  });

  it('lists aliases only for ingredients that exist', () => {
    for (const id of Object.keys(SEARCH_ALIASES)) assert.ok(INGREDIENT_BY_ID.has(id), id);
  });
});

describe('step text clean-up', () => {
  it('strips checkbox glyphs', () => {
    const steps = splitSteps(['▢ Preheat the oven to 180C and grease a tin.\n▢ Mix the almond flour and sugar together well.\nAlmond base ▢.\nPress into the tin and bake until golden.']);
    for (const step of steps) assert.ok(!/[▢☐□]/.test(step), step);
    assert.ok(steps[0]?.startsWith('Preheat'), steps[0]);
  });

  it('joins hard-wrapped lines that continue in lower case', () => {
    const steps = splitSteps(['Rinse the eggplant. Pat dry. Apply some oil all over and\r\nkeep it for roasting on an open flame until the skin is charred all\r\nover.\r\n2. Peel and mash the flesh with a fork.']);
    assert.equal(steps.length, 2, steps.join(' | '));
    assert.ok(steps[0]?.includes('all over and keep it for roasting'), steps[0]);
    assert.ok(!steps.some((s) => s === 'Over.' || s === 'Down.'));
  });

  it('keeps separate lines apart when the next one starts a new sentence', () => {
    const steps = splitSteps(['Chop the onions finely and set aside\nHeat the oil in a large pan over medium heat.']);
    assert.equal(steps.length, 2, steps.join(' | '));
  });
});

describe('timers and measures', () => {
  it('reads clock-style durations', () => {
    assert.equal(detectTimerSeconds('Bake for 1h30 until set.'), 5400);
    assert.equal(detectTimerSeconds('Simmer 2h 15m.'), 8100);
  });

  it('adds "plus" volumes to the first measure', () => {
    const m = parseMeasure('1 cup plus 2 tablespoons flour');
    assert.equal(m.unit, 'cup');
    assert.ok(Math.abs((m.quantity ?? 0) - 1.125) < 0.001, String(m.quantity));
    assert.match(m.rest, /^flour/);
  });
});

describe('gentle excludes frying', () => {
  const base: GentleInputs = {
    course: 'snack',
    kcal: 300,
    sodiumMg: 300,
    totalMinutes: 40,
    effort: 2,
    title: 'Doughnut holes',
    steps: ['Mix the batter until smooth.', 'Drop spoonfuls into hot oil at 365°F and cook until golden.'],
    ingredientIds: ['flour', 'sugar', 'egg'],
  };

  it('rejects hot-oil frying in a step', () => assert.equal(isGentle(base), false));
  it('rejects fritters by title', () => assert.equal(isGentle({ ...base, title: 'Banana Fritters', steps: ['Mix the batter until smooth.'] }), false));
  it('rejects fries as an ingredient', () => assert.equal(isGentle({ ...base, title: 'Loaded bowl', steps: ['Bake until soft.'], ingredientIds: ['fries', 'cheese'] }), false));
  it('rejects a frying-oil line', () => assert.equal(isGentle({ ...base, title: 'Bites', steps: ['Bake until soft.'], fryingOil: true }), false));
  it('still allows softening onions in a little oil', () =>
    assert.equal(isGentle({ ...base, course: 'soup', title: 'Lentil soup', steps: ['Fry the onion gently in a little oil until soft.', 'Add lentils and simmer.'], ingredientIds: ['onion', 'lentil'] }), true));
});

describe('servings for light dishes', () => {
  it('never serves more than twice a typical portion of a light broth', () => {
    // ~1.35 kg of clear soup at ~300 kcal: the energy floor alone would make it one 1.35 kg bowl.
    assert.equal(estimateServings('soup', 1350, 300), 2);
    // ~1 kg of hot and sour broth at under 200 kcal is two bowls, not one.
    assert.equal(estimateServings('soup', 1020, 195), 2);
  });
});
